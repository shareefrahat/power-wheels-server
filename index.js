const express = require("express");
const cors = require("cors");
// const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

//------------Middleware-----------\\

app.use(express.json());
app.use(cors());

//-----------MongoDB API-------------\\

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ygn3v.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    await client.connect();
    console.log("Database: MongDB is connected");

    const productCollection = client.db("PowerWheels").collection("products");

    app.get("/products", async (req, res) => {
      const products = await productCollection.find().toArray();
      res.send(products);
    });
  } finally {
  }
}
run().catch(console.dir);

//-----------Node Server API----------\\

app.get("/", (req, res) => {
  res.send("Server: Node server in running with Express");
});

app.listen(port, () => {
  console.log(`Server app listening on port ${port}`);
});
