const express = require('express');
const bodyParser = require('body-parser');
const ExcelJS = require('exceljs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
// Note: MONGO_URI is expected to be defined in your .env file
// The server will use the MONGO_URI set in your Render environment variables.
const MONGO_URI = process.env.MONGO_URI; 

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        // Exit process on connection failure
        process.exit(1); 
    });


// ===========================================
// 🟢 MONGODB SCHEMA AND MODEL DEFINITION 🟢
// ===========================================

const productionDataSchema = new mongoose.Schema({
    // General Information
    section: { type: String, required: true },
    date: { type: String, required: true },
    shift: String,
    shiftStart: String,
    shiftEnd: String,
    
    // Breakdown data
    breakdownStart1: String,
    breakdownEnd1: String,
    breakdownReason1: String,
    breakdownStart2: String,
    breakdownEnd2: String,
    breakdownReason2: String,
    
    // Production details
    customerName: { type: String, required: true },
    brand: String,
    moldType: String,
    wallThickness: String,
    dateInsert: String,
    bottomMoldCooling: String,
    bottleGeneralStrength: String,
    processes: [String], // Stored as an array of strings (e.g., ['Embossing', 'Labelling'])
    
    // Personnel
    shiftIncharge: String,
    operator: String,
    helpers: String,
    
    // Raw Materials & Output (Storing as String/Number to match existing data flow)
    resinGrade: String,
    virginKg: mongoose.Schema.Types.Mixed, // Use Mixed to handle potential string/number input
    regrindKg: mongoose.Schema.Types.Mixed,
    goodBottles: mongoose.Schema.Types.Mixed,
    rejectedBottles: mongoose.Schema.Types.Mixed,
    preform: mongoose.Schema.Types.Mixed,
    lumpsKg: mongoose.Schema.Types.Mixed,
    
    operatorNotes: String,
    
    // Timestamp for easy retrieval of the last record
    createdAt: { type: Date, default: Date.now }
});

const ProductionRecord = mongoose.model('ProductionRecord', productionDataSchema);


// ===========================================
// 🟢 END MONGODB DEFINITION 🟢
// ===========================================

// --- Unit Weights (Key to Wastage Calculation) ---
const WEIGHTS = {
    'ASB 1 (PET)': 0.706, // Weight of 1 piece in KG
    'ASB 2 (PC)': 0.820,  // Weight of 1 piece in KG
};

// --- Helper function for time calculation (Robust server-side logic) ---
function calculateNetRunningHours(data) {
    const shiftStartStr = data.shiftStart;
    const shiftEndStr = data.shiftEnd;
    
    if (!shiftStartStr || !shiftEndStr) return { netRunningHours: 0, totalDowntimeHours: 0 };
    
    // Helper function to convert "HH:MM" to minutes from midnight (00:00)
    const timeToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };

    let startMinutes = timeToMinutes(shiftStartStr);
    let endMinutes = timeToMinutes(shiftEndStr);
    
    // 1. Calculate Total Planned Shift Duration
    let totalShiftDurationMinutes = endMinutes - startMinutes;
    
    // If the duration is negative, it crossed midnight (e.g., 22:00 to 06:00)
    if (totalShiftDurationMinutes < 0) {
        totalShiftDurationMinutes += 24 * 60;
    }
    if (totalShiftDurationMinutes <= 0) return { netRunningHours: 0, totalDowntimeHours: 0 };

    // 2. Calculate Total Downtime
    let totalDowntimeMinutes = 0;
    
    // Collect all breakdown entries (up to 2)
    const downtimeEntries = [];
    for (let i = 1; i <= 2; i++) {
        const startKey = `breakdownStart${i}`;
        const endKey = `breakdownEnd${i}`;
        if (data[startKey] && data[endKey]) {
            downtimeEntries.push({ start: data[startKey], end: data[endKey] });
        }
    }

    for (const entry of downtimeEntries) {
        let breakStartMinutes = timeToMinutes(entry.start);
        let breakEndMinutes = timeToMinutes(entry.end);
        
        // If breakdown end time is earlier than start time, assume it crosses midnight
        if (breakEndMinutes < breakStartMinutes) {
            breakEndMinutes += 24 * 60; 
        }
        
        const duration = breakEndMinutes - breakStartMinutes;
        if (duration > 0) {
            totalDowntimeMinutes += duration;
        }
    }
    
    // 3. Calculate Net Running Time
    const netRunningTimeMinutes = Math.max(0, totalShiftDurationMinutes - totalDowntimeMinutes);
    
    return { 
        netRunningHours: netRunningTimeMinutes / 60, 
        totalDowntimeHours: totalDowntimeMinutes / 60 
    };
}


// --- Middleware ---
// Assumes static assets (CSS, JS) are in a 'public' folder.
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 🟢 CRITICAL FIX: Explicitly serve index.html from the root path (/)
// This resolves the "Cannot GET /" error.
app.get('/', (req, res) => {
    // This assumes index.html is in the same directory as server.js
    res.sendFile(path.join(__dirname, 'index.html'));
});
// 🟢 END CRITICAL FIX

// --- API Endpoints ---

/**
 * Endpoint to submit new production data (Now saves to MongoDB)
 */
app.post('/submit-production', async (req, res) => {
  const data = req.body;
  console.log('Received data:', data);

  try {
    // Create a new Mongoose document and save it to MongoDB
    const newRecord = new ProductionRecord(data);
    await newRecord.save();
    
    res.status(201).json({ message: 'Production data saved successfully!' });
  } catch (error) {
    console.error('Error saving production data:', error);
    res.status(500).json({ message: 'Failed to save production data.', error: error.message });
  }
});

/**
 * Endpoint to get the list of saved customers (Now queries MongoDB for distinct values)
 */
app.get('/get-customers', async (req, res) => {
  try {
    // Use Mongoose to get distinct customer names
    const distinctCustomers = await ProductionRecord.distinct('customerName');
    res.json(distinctCustomers);
  } catch (error) {
    console.error('Error fetching customers:', error);