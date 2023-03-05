import { MongoClient } from "mongodb"
import * as dotenv from "dotenv"

dotenv.config()
const client = new MongoClient(process.env.MONGO_URL || "")
export const db = client.db("bot")
