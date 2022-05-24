const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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

function verifyJWT(req, res, next) {
  const authHeader = req?.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    console.log("Database: MongDB is connected");

    const productCollection = client.db("PowerWheels").collection("products");
    const userCollection = client.db("PowerWheels").collection("users");
    const orderCollection = client.db("PowerWheels").collection("orders");
    const paymentCollection = client.db("PowerWheels").collection("payments");
    const reviewCollection = client.db("PowerWheels").collection("reviews");

    //-------------Verify Admin----------\\

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    //--------------Create Payment Intent for Stripe--------------\\

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const totalCost = service.totalCost;
      const amount = totalCost * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "USD",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //--------GET All PRODUCTS-------\\
    app.get("/products", async (req, res) => {
      const products = await productCollection.find().toArray();
      res.send(products);
    });

    //---------Get All user from User Collection-----------\\

    app.get("/allUsers", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    //-----------Admin email checker API for useAdmin hook----------\\

    app.get("/admin/:email", async (req, res) => {
      const email = req.params?.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    //----------Get a single user from User Collection----------\\

    app.get("/user/:email", verifyJWT, async (req, res) => {
      const email = req.params?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send(user);
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
        { expiresIn: "10d" }
      );
      res.send({ result, token });
    });

    //--------------Update a single user collection in DB--------------\\
    app.put("/users/:email", verifyJWT, async (req, res) => {
      const email = req.params?.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    //-----------Put user role as admin------------\\

    app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params?.email;
      const requester = req.decoded?.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });

      const filter = { email: email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //--------Insert a new order In oderCollection-----------\\

    app.post("/orders", async (req, res) => {
      const order = req.body;
      const query = {
        email: order.email,
        productId: order.productId,
      };
      const exists = await orderCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, order: exists });
      }
      const result = await orderCollection.insertOne(order);
      return res.send({ success: true, result });
    });

    //--------------Update single order after payment completed-------\\

    app.patch("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params?.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment?.transactionId,
        },
      };
      const result = await paymentCollection.insertOne(payment);
      const updateOrder = await orderCollection.updateOne(filter, updateDoc);
      return res.send(updateDoc);
    });

    //--------------Update single order Shipment completed-------\\

    app.patch("/orders/", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.query?.id;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "shipped",
        },
      };
      const updateOrder = await orderCollection.updateOne(filter, updateDoc);
      return res.send(updateOrder);
    });

    //--------------Get all orders for admin-----------\\

    app.get("/orders", verifyJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const orders = await orderCollection.find(query).toArray();
      return res.send(orders);
    });

    //----------Get all orders of individual user by email query--------\\

    app.get("/orders", async (req, res) => {
      const email = req.query?.email;
      const decodedEmail = req.decoded?.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const orders = await orderCollection.find(query).toArray();
        return res.send(orders);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    //----------Get a single order by Id from oderCollection----------\\

    app.get("/orders/:id", verifyJWT, async (req, res) => {
      const id = req.params?.id;
      const query = { _id: ObjectId(id) };
      const order = await orderCollection.findOne(query);
      return res.send(order);
    });

    //----------Delete a single order by owner of the order-------------\\

    app.delete("/orders", verifyJWT, async (req, res) => {
      const order = req.body;
      const decodedEmail = req.decoded?.email;
      if (order?.email === decodedEmail) {
        const filter = {
          email: order.email,
          productId: order.productId,
        };
        const result = await orderCollection.deleteOne(filter);
        return res.send(result);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    //-----------POST or Update a Review from an user----------\\

    app.put("/reviews/:email", verifyJWT, async (req, res) => {
      const email = req?.params?.email;
      const updateReview = req.body;
      const filter = { email: email };

      const options = { upsert: true };
      const updateDoc = {
        $set: updateReview,
      };
      const result = await reviewCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    //----------GET All reviews from database---------\\

    app.get("/reviews", async (req, res) => {
      const reviews = await reviewCollection.find().toArray();
      res.send(reviews);
    });

    //-----------Get a single review by userEmail----------\\
    app.get("/reviews/:email", verifyJWT, async (req, res) => {
      const email = req.params?.email;
      const query = { email: email };
      const review = await reviewCollection.findOne(query);
      return res.send(review);
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
