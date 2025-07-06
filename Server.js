const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Razorpay = require("razorpay");
const path = require("path");
const app = express();
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const { type } = require("os");
require("dotenv").config();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Schema & Model
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

const User = mongoose.model("User", UserSchema, "users");

const locationSchema = new mongoose.Schema({
  name: String,
  city_id: Number,
  location_id: Number,
  city: String,
  country_name: String,
});

const Location = mongoose.model("Location", locationSchema, "location");

const restaurentSchema = new mongoose.Schema({
  name: String,
  city_id: Number,
  location_id: [Number],
  address: String,
  cuisine: [{ id: Number, name: String }],
  rating: Number,
  min_price: Number,
  contact_number: String,
  locality: String,
  city: String,
  rating_text: String,
  mealtype_id: [Number],
});

const Restaurent = mongoose.model("Restaurent", restaurentSchema, "restaurent");

const mealtypesSchema = new mongoose.Schema({
  name: String,
  content: String,
  meal_type: Number,
  image: String,
});

const Mealtype = mongoose.model("mealtypes", mealtypesSchema, "mealtypes");

const menufileSchema = new mongoose.Schema({
  name: String,
  location_id: Number,
  restaurant_id: String,
  mealtype_id: Number,
  order_id: String,
  price: Number,
  image: String,
  description: String,
});

const Menufile = mongoose.model("menufile", menufileSchema, "menufile");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

app.post("/create-order", async (req, res) => {
  const { amount } = req.body;
  console.log(amount);

  const options = {
    amount: req.body.amount * 100,
    currency: "INR",
    receipt: `order_${Date.now()}`,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.log(error);
    res.status(500).json("Failed");
  }
});

app.get("/menufile/:restaurant_id", async (req, res) => {
  try {
    const { restaurant_id } = req.params;
    const menus = await Menufile.find({ restaurant_id: restaurant_id });

    if (!menus || menus.length === 0) {
      return res.status(404).json({ error: "No menu Found" });
    }

    res.json({ menufile: menus });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get restaurants by location_id (list)
app.get("/restaurant/:location_id", async (req, res) => {
  try {
    const locationId = Number(req.params.location_id);
    const restaurant = await Restaurent.find({ location_id: locationId });
    res.json({ restaurent: restaurant });
  } catch (error) {
    res.status(500).json({ error: "Restaurant not found" });
  }
});

// Get single restaurant by MongoDB _id
app.get("/restaurant/details/:id", async (req, res) => {
  const { id } = req.params;
  console.log("Backend: requested restaurant ID:", id);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    console.log("Backend: invalid ObjectId:", id);
    return res.status(400).json({ message: "Invalid restaurant ID" });
  }

  try {
    const restaurent = await Restaurent.findById(id);

    if (!restaurent) {
      console.log("Backend: no restaurant found for ID:", id);
      return res.status(404).json({ message: "Restaurant not found" });
    }

    console.log("Backend: restaurant found:", restaurent.name);
    res.json({ restaurent });
  } catch (err) {
    console.error("Backend: error fetching restaurant:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// API Route to get locations
app.get("/location", async (req, res) => {
  try {
    const locations = await Location.find();
    res.json({ locations });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// API Route to get meal types
app.get("/mealtypes", async (req, res) => {
  try {
    const mealtypes = await Mealtype.find();
    res.json({ mealtypes });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/apisignup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User Already Exists" });
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashPassword,
    });

    await newUser.save();
    res.status(201).json({ message: "Created Successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error" });
  }
});

app.post('/apilogin',async (req,res)=>{
  try {
    const {email,password}=req.body;

  const user=await User.findOne({email})

  if(!user){
    res.status(400).json({message:'No Email Credentials'})
  }

  const isMatch=await bcrypt.compare(password,user.password)

  if(!isMatch){
     res.status(400).json({message:'Enter Valid Password'})
  }

  res.status(200).json({message:'Login Successfully!'})
    
  } catch (error) {
    console.log(error);
    res.status(500).json({message:'Server Error'})
  }
})

app.post("/filter", async (req, res) => {
  try {
    const {
      mealtype,
      location,
      cuisine,
      cost = [],
      sort = 1,
      page = 1,
      limit = 3,
    } = req.body;

    console.log("Received filter request:", req.body);

    if (!mealtype) {
      return res.status(400).json({ message: "Select mealtype" });
    }

    const filter = {
      mealtype_id: { $in: [Number(mealtype)] },
    };

    if (location) {
      filter.location_id = { $in: [Number(location)] };
    }

    if (cuisine && cuisine.length > 0) {
      filter["cuisine.id"] = { $in: cuisine.map(Number) };
    }

    let costFilter = [];
    if (cost.length > 0) {
      costFilter = cost.map(({ lcost, hcost }) => ({
        min_price: { $gte: lcost, $lte: hcost },
      }));
    }

    const finalFilter =
      costFilter.length > 0 ? { ...filter, $or: costFilter } : filter;

    // Count total matching documents (for pagination)
    const totalCount = await Restaurent.countDocuments(finalFilter);
    const totalPages = Math.ceil(totalCount / limit);

    // Pagination logic
    const skip = (page - 1) * limit;

    const restaurants = await Restaurent.find(finalFilter)
      .sort({ min_price: sort })
      .skip(skip)
      .limit(limit);

    res.json({ restaurants, totalPages });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

// Serve React build (AFTER all API routes)

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
