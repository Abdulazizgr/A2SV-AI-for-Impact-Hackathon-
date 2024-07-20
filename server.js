const express = require("express");
const bodyParser = require("body-parser");
const multer = require("multer");
const mongoose = require("mongoose");
const { MongoClient, GridFSBucket } = require("mongodb");

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
require("dotenv").config();
const Groq = require("groq-sdk");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// MongoDB connection URI
const mongoUri = process.env.MONGO_URI;

// Initialize MongoDB client and GridFSBucket
const client = new MongoClient(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

client.connect().then(() => {
  console.log("MongoDB connected");
}).catch((err) => {
  console.error("MongoDB connection error:", err);
});

const app = express();
const port = 3000;

const upload = multer({ dest: "uploads/" });

// GridFS setup
const bucket = new GridFSBucket(client.db(), { bucketName: "uploads" });

app.use(bodyParser.json());
app.use(express.static("public"));

// File upload endpoint
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = path.join(__dirname, "uploads", req.file.filename);
    const fileStream = fs.createReadStream(filePath);
    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      metadata: { contentType: req.file.mimetype },
    });

    fileStream.pipe(uploadStream)
      .on("error", (error) => {
        console.error("Error uploading file:", error.message);
        res.status(500).json({ error: error.message });
      })
      .on("finish", async () => {
        console.log("File uploaded successfully");
        fs.unlinkSync(filePath); // Cleans up temporary file

        const fileId = uploadStream.id;
        const fileData = await fetchAndProcessFile(fileId);
        res.status(200).json(fileData);
      });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Fetch and process file from GridFS
async function fetchAndProcessFile(fileId) {
  return new Promise((resolve, reject) => {
    const downloadStream = bucket.openDownloadStream(fileId);
    let fileBuffer = Buffer.alloc(0);

    downloadStream.on("data", (chunk) => {
      fileBuffer = Buffer.concat([fileBuffer, chunk]);
    });

    downloadStream.on("end", async () => {
      try {
        let fileText = "";
        const fileType = downloadStream.file?.metadata?.contentType || "Unknown";

        if (fileType === "application/pdf") {
          const data = await pdfParse(fileBuffer);
          fileText = data.text;
        } else if (fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          const data = await mammoth.extractRawText({ buffer: fileBuffer });
          fileText = data.value;
        }

        resolve({ text: fileText, fileType });
      } catch (error) {
        reject(error);
      }
    });

    downloadStream.on("error", (err) => {
      console.error("Error downloading file:", err);
      reject(err);
    });
  });
}

// Groq API endpoint
app.post("/api/generate", async (req, res) => {
  console.log("Received request:", req.body);

  try {
    const prompt = req.body.prompt;
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama3-8b-8192",
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "";

    res.json({ text: responseText });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
