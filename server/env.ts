import * as fs from "fs";
import * as path from "path";

for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
]) {
  if (fs.existsSync(candidate)) {
    require("dotenv").config({ path: candidate });
    break;
  }
}
