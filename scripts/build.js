const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js", "question_bank.schema.json"]) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}

fs.cpSync(path.join(root, "public"), path.join(dist, "public"), { recursive: true });

console.log("dist 생성 완료");
