import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = "http://localhost:5000/api";

export default function App() {

  const [declarationNumber, setDeclarationNumber] = useState("");
  const [date, setDate] = useState("");
  const [files, setFiles] = useState([]);
  const [data, setData] = useState([]);
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [creating, setCreating] = useState(false);

  const fileInputRef = useRef();

  // ================= LOAD =================
  const load = async () => {
    try {
      const res = await axios.get(`${API}/list`);
      setData(res.data);
    } catch (err) {
      console.error(err);
      alert("❌ Failed to load data");
    }
  };

  useEffect(() => {
    load();
  }, []);

  // ================= DATE VALIDATION =================
  const isValidDate = (date) => {
    return /^\d{2}\/\d{2}\/\d{4}$/.test(date);
  };

  // ================= CREATE =================
  const create = async () => {

    if (!declarationNumber || !date) {
      alert("Enter all fields");
      return;
    }

    if (!/^\d{13}$/.test(declarationNumber)) {
      alert("Declaration must be 13 digits");
      return;
    }

    if (!isValidDate(date)) {
      alert("Date must be dd/mm/yyyy");
      return;
    }

    try {
      setCreating(true);

      await axios.post(`${API}/declaration`, {
        declaration_number: declarationNumber,
        date
      });

      alert("✅ Declaration Created");

      setDeclarationNumber("");
      setDate("");

      load();

    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.error || "❌ Error creating declaration");
    } finally {
      setCreating(false);
    }
  };

  // ================= FILE SELECT =================
  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files));
  };

  // ================= UPLOAD =================
  const upload = async (pNo) => {

    if (!files.length) {
      alert("Select file first");
      return;
    }

    const fd = new FormData();
    files.forEach(f => fd.append("files", f));

    try {
      setLoadingId(pNo);

      await axios.post(`${API}/upload/${pNo}`, fd, {
        timeout: 60000
      });

      alert("✅ Validation Completed");

      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";

      load();

    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.error || "❌ Upload failed");
    } finally {
      setLoadingId(null);
    }
  };

  // ================= VIEW DOCUMENTS =================
  const view = async (pNo) => {
    try {
      const res = await axios.get(`${API}/documents/${pNo}`);
      setDocs(res.data);
      setSelected(pNo);
    } catch (err) {
      console.error(err);
      alert("❌ Failed to load documents");
    }
  };

  // ================= STATUS STYLE =================
  const getStatusClass = (status) => {
    switch (status) {
      case "APPROVED":
        return "badge bg-success";
      case "REJECTED":
        return "badge bg-danger";
      case "CLOSED":
        return "badge bg-primary";
      default:
        return "badge bg-warning";
    }
  };

  return (
    <div className="container mt-4">

      <h3 className="mb-4 text-center">
        🚀 Invoice Declaration Validation System
      </h3>

      {/* ================= CREATE ================= */}
      <div className="card p-3 mb-4 shadow-sm">
        <div className="row g-2">

          <div className="col-md-4">
            <input
              className="form-control"
              placeholder="13 Digit Declaration Number"
              value={declarationNumber}
              onChange={e => setDeclarationNumber(e.target.value)}
            />
          </div>

          <div className="col-md-3">
            <input
              type="text"
              placeholder="dd/mm/yyyy"
              className="form-control"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="col-md-3">
            <input
              type="file"
              multiple
              className="form-control"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
          </div>

          <div className="col-md-2">
            <button
              className="btn btn-primary w-100"
              onClick={create}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>

        </div>
      </div>

      {/* ================= TABLE ================= */}
      <table className="table table-bordered shadow-sm">
        <thead className="table-dark">
          <tr>
            <th>Declaration</th>
            <th>Date</th>
            <th>Status</th>
            <th>Upload</th>
            <th>View</th>
          </tr>
        </thead>

        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan="5" className="text-center">No Data Found</td>
            </tr>
          ) : (
            data.map(d => (
              <tr key={d.id}>
                <td>{d.declaration_number}</td>
                <td>{d.date}</td>

                <td>
                  <span className={getStatusClass(d.status)}>
                    {d.status}
                  </span>
                </td>

                <td>
                  <button
                    className="btn btn-success btn-sm"
                    disabled={loadingId === d.declaration_number}
                    onClick={() => upload(d.declaration_number)}
                  >
                    {loadingId === d.declaration_number ? "Processing..." : "Upload"}
                  </button>
                </td>

                <td>
                  <button
                    className="btn btn-info btn-sm"
                    onClick={() => view(d.declaration_number)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* ================= MODAL ================= */}
      {selected && (
        <div className="modal show d-block">
          <div className="modal-dialog modal-lg">
            <div className="modal-content p-3">

              <h5>📄 Documents: {selected}</h5>

              <table className="table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Child No</th>
                    <th>Date</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {docs.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center">
                        No Documents
                      </td>
                    </tr>
                  ) : (
                    docs.map(d => (
                      <tr key={d.id}>
                        <td>{d.file_name}</td>
                        <td>{d.child_declaration_number}</td>
                        <td>{d.date}</td>

                        <td>
                          <span className={getStatusClass(d.status)}>
                            {d.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <button
                className="btn btn-secondary"
                onClick={() => setSelected(null)}
              >
                Close
              </button>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
