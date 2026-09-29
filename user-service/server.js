require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const userRoutes = require('./routes/users');
const User = require('./models/User');

const app = express();
const PORT = process.env.USER_SERVICE_PORT || process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/user_db';

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[USER-SERVICE] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    next();
});

// Root Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({
        service: "User Service",
        port: PORT,
        status: "UP",
        dbStatus: mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED",
        database: "user_db",
        endpoints: {
            getAllUsers: "GET /users",
            getUserById: "GET /users/:id",
            createUser: "POST /users",
            updateUser: "PUT /users/:id",
            deleteUser: "DELETE /users/:id"
        }
    });
});

app.use('/users', userRoutes);

async function connectDB() {
    let connected = false;
    let attempts = 0;
    while (!connected && attempts < 15) {
        try {
            attempts++;
            await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
            connected = true;
            console.log(`🍃 User Service connected to MongoDB database: user_db at ${MONGO_URI}`);
            
            const count = await User.countDocuments();
            if (count === 0) {
                await User.insertMany([
                    { _id: "usr-101", name: "Aarav Patel", email: "aarav@example.com", role: "Student", department: "Computer Science" },
                    { _id: "usr-102", name: "Aman Rohera", email: "aman.rohera@university.edu", role: "Student", department: "Information Technology" },
                    { _id: "usr-103", name: "Priya Sharma", email: "priya.sharma@example.com", role: "Student", department: "Software Engineering" }
                ]);
                console.log(`🌱 Initial user database seeded with 3 sample users (usr-101, usr-102, usr-103).`);
            }
        } catch (err) {
            console.error(`❌ User Service Connection Attempt ${attempts}/15 failed: ${err.message}. Retrying in 2 seconds...`);
            await new Promise(res => setTimeout(res, 2000));
        }
    }
}

app.listen(PORT, async () => {
    console.log(`=======================================================`);
    console.log(`🚀 User Service running on port ${PORT}`);
    console.log(`🔗 Resource Endpoint: http://localhost:${PORT}/users`);
    console.log(`=======================================================`);
    await connectDB();
});
