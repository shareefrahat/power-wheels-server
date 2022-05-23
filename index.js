const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
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

//--------Verify JWT----------\\

// function verifyJWT(req, res, next) {
//   const authHeader = req?.headers?.authorization;
//   if (!authHeader) {
//     return res.status(401).send({ message: "Unauthorized access" });
//   }
//   const token = authHeader.split(" ")[1];

//   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
//     if (err) {
//       return res.status(403).send({ message: "Forbidden access" });
//     }
//     req.decoded = decoded;
//     next();
//   });
// }

async function run() {
  try {
    await client.connect();
    console.log("Database: MongDB is connected");

    const productCollection = client.db("PowerWheels").collection("products");
    const userCollection = client.db("PowerWheels").collection("users");

    //--------GET All PRODUCTS-------\\
    app.get("/products", async (req, res) => {
      const products = await productCollection.find().toArray();
      res.send(products);
    });

    //--------Save User in DB and Create JWT when SignUp---------\\

    app.put("/user/:email", async (req, res) => {
      const email = req.params?.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);

      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1d" }
      );
      res.send({ result, token });
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
