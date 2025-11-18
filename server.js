const express = require('express');
const bodyParser = require('body-parser');
const ExcelJS = require('exceljs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
// Note: MONGO_URI is expected to be defined in your Render environment variables.
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
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 🟢 FIX: Explicitly serve index.html from the root path (/)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

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
}); // <-- This closing brace and parenthesis are essential for syntax

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
    res.status(500).json({ message: 'Failed to fetch customers.' });
  }
});

// 🟢 NEW ENDPOINT: Get the last submitted record (Now queries MongoDB) 🟢
app.get('/get-last-record', async (req, res) => {
    try {
        // Find one record, sorted by the latest creation time
        const lastRecord = await ProductionRecord.findOne().sort({ createdAt: -1 }).limit(1);

        if (!lastRecord) {
            return res.status(404).json({ message: 'No records found.' });
        }
        
        // Return the plain JavaScript object
        res.json(lastRecord.toObject());
    } catch (error) {
        console.error('Error fetching last record:', error);
        res.status(500).json({ message: 'Failed to fetch last record.' });
    }
});

/**
 * Endpoint to download the Excel report (Now fetches data from MongoDB)
 */
app.get('/download-excel', async (req, res) => {
    
    const sectionFilter = req.query.section; 
    
    let dataToReport = [];
    let filename = 'Production_Report_All.xlsx';
    const query = {}; // MongoDB filter object

    if (sectionFilter) {
        query.section = sectionFilter;
        const safeSectionName = sectionFilter.replace(/[()\s]/g, '_').replace(/_+/g, '_').replace(/_$/, '');
        filename = `Production_Report_${safeSectionName}.xlsx`;
    }

    try {
        // Fetch data from MongoDB based on filter. .lean() converts Mongoose documents to plain JS objects.
        dataToReport = await ProductionRecord.find(query).lean(); 
    } catch (error) {
        console.error('Error fetching data for Excel:', error);
        return res.status(500).send('Failed to fetch data for report.');
    }


    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sectionFilter || 'All Production');

    // 2. Define Columns (Including new Downtime and Running Hours)
    worksheet.columns = [
        { header: 'Section', key: 'section', width: 10 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Shift', key: 'shift', width: 10 },
        { header: 'Start Time', key: 'shiftStart', width: 10 },
        { header: 'End Time', key: 'shiftEnd', width: 10 },
        
        // BREAKDOWN COLUMNS
        { header: 'Downtime 1 Stop', key: 'breakdownStart1', width: 15 },
        { header: 'Downtime 1 Start', key: 'breakdownEnd1', width: 15 },
        { header: 'Downtime 1 Reason', key: 'breakdownReason1', width: 20 },
        { header: 'Downtime 2 Stop', key: 'breakdownStart2', width: 15 },
        { header: 'Downtime 2 Start', key: 'breakdownEnd2', width: 15 },
        { header: 'Downtime 2 Reason', key: 'breakdownReason2', width: 20 },
        { header: 'Total Downtime (Hrs)', key: 'totalDowntimeHours', width: 18 },
        { header: 'Net Running Hours', key: 'netRunningHours', width: 18 },
        
        { header: 'Customer Name', key: 'customerName', width: 20 },
        { header: 'Brand', key: 'brand', width: 15 },
        { header: 'Mold Type', key: 'moldType', width: 15 },
        { header: 'Wall thickness (Good/Bad)', key: 'wallThickness', width: 20 },
        { header: 'Date insert (Yes/No)', key: 'dateInsert', width: 18 },
        { header: 'Bottom mold/ cooling (Yes/No)', key: 'bottomMoldCooling', width: 25 },
        { header: 'Bottle strength (Good/Bad)', key: 'bottleGeneralStrength', width: 22 },
        { header: 'Embossing', key: 'embossing', width: 10 },
        { header: 'Screen Printing', key: 'screenPrinting', width: 15 },
        { header: 'Hot-Stamping', key: 'hotStamping', width: 15 },
        { header: 'Labelling', key: 'labelling', width: 10 },
        { header: 'Shift Incharge', key: 'shiftIncharge', width: 15 },
        { header: 'Operator', key: 'operator', width: 15 },
        { header: 'Helpers', key: 'helpers', width: 20 },
        { header: 'Resin/Grade', key: 'resinGrade', width: 15 },
        { header: 'Virgin (KG)', key: 'virginKg', width: 12 },
        { header: 'Regrind (KG)', key: 'regrindKg', width: 12 },
        { header: 'Good Bottles (Pcs)', key: 'goodBottles', width: 15 },
        { header: 'Rejected Bottles (Pcs)', key: 'rejectedBottles', width: 18 },
        { header: 'Preform (Pcs)', key: 'preform', width: 12 },
        { header: 'Lump (KG)', key: 'lumpsKg', width: 12 }, 
        { header: 'Wastage (%)', key: 'wastagePercentage', width: 14 },
        { header: 'Operator Notes', key: 'operatorNotes', width: 30 }
    ];

    // 3. Add Data Rows with Calculation
    const excelData = dataToReport.map(entry => {
        // --- WASTAGE CALCULATION LOGIC ---
        const unitWeight = WEIGHTS[entry.section] || 0; 
        
        // Use parseFloat/parseInt on the retrieved MongoDB data (which might be mixed types)
        const goodBottlesCount = parseInt(entry.goodBottles) || 0;
        const rejectedBottlesCount = parseInt(entry.rejectedBottles) || 0;
        const preformCount = parseInt(entry.preform) || 0; 
        const lumpsKg = parseFloat(entry.lumpsKg) || 0; 

        const goodKg = goodBottlesCount * unitWeight;
        const rejectedKg = rejectedBottlesCount * unitWeight;
        const preformKg = preformCount * unitWeight; 

        const totalWastageKg = rejectedKg + preformKg + lumpsKg;
        const totalInputKg = goodKg + totalWastageKg;

        let wastagePercentage = 0;
        if (totalInputKg > 0) {
            wastagePercentage = (totalWastageKg / totalInputKg) * 100;
        }
        
        // RUN NET RUNNING HOURS CALCULATION
        const timeResults = calculateNetRunningHours(entry);
        // --- END CALCULATION LOGIC ---
        
        // Map data to Excel format
        return {
            ...entry, 
            // processes is stored as an array in Mongo, check inclusion
            embossing: entry.processes && entry.processes.includes('Embossing') ? 'Yes' : 'No',
            screenPrinting: entry.processes && entry.processes.includes('Screen Printing') ? 'Yes' : 'No',
            hotStamping: entry.processes && entry.processes.includes('Hot-Stamping') ? 'Yes' : 'No',
            labelling: entry.processes && entry.processes.includes('Labelling') ? 'Yes' : 'No',
            
            // Add calculated fields to the row
            totalDowntimeHours: timeResults.totalDowntimeHours.toFixed(2),
            netRunningHours: timeResults.netRunningHours.toFixed(2),
            wastagePercentage: wastagePercentage.toFixed(2) + '%' 
        };
    }); 

    worksheet.addRows(excelData);

    // 4. Set headers to trigger file download
    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
        'Content-Disposition',
        'attachment; filename=' + filename
    );

    // 5. Write file to response
    await workbook.xlsx.write(res);
    res.end();
}); 


// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});