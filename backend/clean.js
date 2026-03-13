const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("invoice.db");

db.serialize(() => {

  console.log("Cleaning declarations table...");

  db.run("DELETE FROM declarations", function (err) {
    if (err) {
      console.error("Error deleting data:", err.message);
    } else {
      console.log("All records deleted from declarations table");
    }
  });

});

db.close(() => {
  console.log("Database connection closed");
});
