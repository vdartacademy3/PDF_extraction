const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("invoice.db");

db.serialize(() => {

  console.log("Clearing documents table...");

  db.run("DELETE FROM documents", function (err) {
    if (err) {
      console.error("Error:", err.message);
    } else {
      console.log("Documents table cleared successfully");
    }
  });

  // 🔥 Optional: Reset ID auto increment
  db.run("DELETE FROM sqlite_sequence WHERE name='documents'");
});

db.close(() => {
  console.log("Database connection closed");
});
