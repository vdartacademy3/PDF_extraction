const express = require("express");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const pdf = require("pdf-poppler");

const app = express();
app.use(cors());
app.use(express.json());

/* ================= DB ================= */
const db = new sqlite3.Database("invoice.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS declarations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    declaration_number TEXT,
    date TEXT,
    status TEXT DEFAULT 'PENDING'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    declaration_number TEXT,
    file_name TEXT,
    child_declaration_number TEXT,
    date TEXT,
    status TEXT
  )`);
});

/* ================= MULTER ================= */
const uploadDir = path.join(__dirname, "uploads");
const tempDir = path.join(__dirname, "temp");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });

/* ================= DATE EXTRACTOR ================= */
function extractAndFormatDate(text) {
  if (!text) return "NOT_FOUND";

  text = text.replace(/\s+/g, " ").toLowerCase();

  // dd/mm/yyyy OR dd-mm-yyyy
  let match = text.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
  if (match) return `${match[1]}/${match[2]}/${match[3]}`;

  // yyyy-mm-dd
  match = text.match(/\b(\d{4})[\/\-](\d{2})[\/\-](\d{2})\b/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;

  // 11 Nov 2025
  match = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})\b/);
  if (match) {
    const months = {
      jan: "01", feb: "02", mar: "03", apr: "04",
      may: "05", jun: "06", jul: "07", aug: "08",
      sep: "09", oct: "10", nov: "11", dec: "12"
    };

    const day = match[1].padStart(2, "0");
    const month = months[match[2].substring(0,3)];
    const year = match[3];

    return `${day}/${month}/${year}`;
  }

  return "NOT_FOUND";
}

/* ================= PDF → IMAGE ================= */
async function convertPdfToImage(filePath) {
  const opts = {
    format: "png",
    out_dir: tempDir,
    out_prefix: path.basename(filePath, path.extname(filePath)),
    page: 1,
  };

  await pdf.convert(filePath, opts);

  return path.join(tempDir, `${opts.out_prefix}-1.png`);
}

/* ================= OCR ================= */
async function extractFromOCR(filePath) {
  try {
    const imagePath = await convertPdfToImage(filePath);

    const result = await Tesseract.recognize(imagePath, "eng");
    const text = result.data.text;

    console.log("🔍 OCR TEXT:\n", text);

    const numMatch = text.match(/\d{13}/);

    return {
      extractedNo: numMatch ? numMatch[0] : "NOT_FOUND",
      extractedDate: extractAndFormatDate(text),
    };

  } catch (err) {
    console.log("OCR ERROR:", err.message);

    return {
      extractedNo: "ERROR",
      extractedDate: "ERROR",
    };
  }
}

/* ================= CREATE ================= */
app.post("/api/declaration", (req, res) => {
  const { declaration_number, date } = req.body;

  if (!/^\d{13}$/.test(declaration_number))
    return res.status(400).json({ error: "Invalid declaration number" });

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date))
    return res.status(400).json({ error: "Date must be dd/mm/yyyy" });

  db.run(
    `INSERT INTO declarations (declaration_number, date) VALUES (?, ?)`,
    [declaration_number, date],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ id: this.lastID });
    }
  );
});

/* ================= UPLOAD ================= */
app.post("/api/upload/:parentNumber", upload.array("files"), async (req, res) => {

  const parentNumber = req.params.parentNumber;

  try {

    const parentRow = await new Promise((resolve, reject) => {
      db.get(
        `SELECT date FROM declarations WHERE declaration_number=?`,
        [parentNumber],
        (err, row) => err ? reject(err) : resolve(row)
      );
    });

    const parentDate = parentRow ? parentRow.date : "NOT_FOUND";

    console.log("📌 Parent:", parentNumber, parentDate);

    const results = [];

    for (const file of req.files) {

      try {

        let childNumber = "NOT_FOUND";
        let extractedDate = "NOT_FOUND";
        let text = "";

        // ===== TRY PDF PARSE =====
        try {
          const buffer = fs.readFileSync(file.path);
          const data = await pdfParse(buffer);
          text = data.text || "";
        } catch (err) {
          console.log("⚠️ PDF Parse Failed:", err.message);
        }

        // ===== FALLBACK OCR =====
        if (!text || text.trim().length < 20) {
          console.log("🔄 OCR MODE");

          const result = await extractFromOCR(file.path);
          childNumber = result.extractedNo;
          extractedDate = result.extractedDate;

        } else {
          const numMatch = text.match(/\d{13}/);
          childNumber = numMatch ? numMatch[0] : "NOT_FOUND";
          extractedDate = extractAndFormatDate(text);
        }

        console.log("✅ FINAL:", childNumber, extractedDate);

        // ===== VALIDATION =====
        let status = "PENDING";

        if (childNumber === parentNumber && extractedDate === parentDate) {
          status = "APPROVED";
        } else if (childNumber === "NOT_FOUND") {
          status = "PENDING";
        } else {
          status = "REJECTED";
        }

        // ===== STORE =====
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO documents 
            (declaration_number, file_name, child_declaration_number, date, status)
            VALUES (?, ?, ?, ?, ?)`,
            [parentNumber, file.filename, childNumber, extractedDate, status],
            (err) => err ? reject(err) : resolve()
          );
        });

        results.push({ file: file.filename, status });

      } catch (innerErr) {
        console.log("❌ FILE ERROR:", innerErr.message);
      }

      // delete temp file
      try { fs.unlinkSync(file.path); } catch {}

    }

    // ===== UPDATE PARENT =====
    db.run(
      `UPDATE declarations SET status = (
        SELECT CASE 
          WHEN COUNT(*) = SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END)
          THEN 'CLOSED'
          ELSE 'PENDING'
        END
        FROM documents WHERE declaration_number=?
      ) WHERE declaration_number=?`,
      [parentNumber, parentNumber]
    );

    res.json({
      message: "Processed",
      results
    });

  } catch (err) {
    console.log("❌ SERVER ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});


/* ================= GET ================= */
app.get("/api/list", (_, res) => {
  db.all(`SELECT * FROM declarations`, [], (_, rows) => res.json(rows));
});

app.get("/api/documents/:parentNumber", (req, res) => {
  db.all(
    `SELECT * FROM documents WHERE declaration_number=?`,
    [req.params.parentNumber],
    (_, rows) => res.json(rows)
  );
});

/* ================= START ================= */
app.listen(5000, () =>
  console.log("🚀 Server running http://localhost:5000")
);
