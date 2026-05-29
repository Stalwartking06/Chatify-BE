import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Enable autoIndex ONLY in development, not production
    mongoose.set("autoIndex", true);
    const mongoUri =
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/chatapp";
    console.log(`Connecting to MongoDB at: ${mongoUri}`);

    const conn = await mongoose.connect(mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
