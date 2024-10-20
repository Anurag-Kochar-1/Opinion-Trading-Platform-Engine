import express, { Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 4000;

app.get("/", (_, res: Response) => {
  res.json({ message: "ENGINE 🚂🚂🚂" });
});

app.listen(port, () => {
  console.log(`The server is running at http://localhost:${port}`);
});
