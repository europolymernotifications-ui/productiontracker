const express = require('express');
const bodyParser = require('body-parser');
const ExcelJS = require('exceljs');
const path = require('path');

const app = express();
const PORT = 3000;

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

// --- In-Memory Storage (Temporary) ---
const productionData = [];
const customers = new Set(['Acme Corp', 'WaterPure Ltd.']); 

// --- API Endpoints ---

/**
 * Endpoint to submit new production data
 */
app.post('/submit-production', (req, res) => {
  const data = req.body;
  console.log('Received data:', data);

  productionData.push(data); 
  
  if (!customers.has(data.customerName)) {
    customers.add(data.customerName);
  }
  
  res.status(201).json({ message: 'Production data saved successfully!' });
});

/**
 * Endpoint to get the list of saved customers
 */
app.get('/get-customers', (req, res) => {
  res.json(Array.from(customers));
});

/**
 * Endpoint to download the Excel report
 */
app.get('/download-excel', async (req, res) => {
    
    const sectionFilter = req.query.section; 
    
    let dataToReport = productionData;
    let filename = 'Production_Report_All.xlsx';

    if (sectionFilter) {
        dataToReport = productionData.filter(entry => entry.section === sectionFilter);
        const safeSectionName = sectionFilter.replace(/[()\s]/g, '_').replace(/_+/g, '_').replace(/_$/, '');
        filename = `Production_Report_${safeSectionName}.xlsx`;
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
        
        // 🟢 NEW BREAKDOWN COLUMNS 🟢
        { header: 'Downtime 1 Stop', key: 'breakdownStart1', width: 15 },
        { header: 'Downtime 1 Start', key: 'breakdownEnd1', width: 15 },
        { header: 'Downtime 1 Reason', key: 'breakdownReason1', width: 20 },
        { header: 'Downtime 2 Stop', key: 'breakdownStart2', width: 15 },
        { header: 'Downtime 2 Start', key: 'breakdownEnd2', width: 15 },
        { header: 'Downtime 2 Reason', key: 'breakdownReason2', width: 20 },
        { header: 'Total Downtime (Hrs)', key: 'totalDowntimeHours', width: 18 },
        { header: 'Net Running Hours', key: 'netRunningHours', width: 18 },
        // 🟢 END BREAKDOWN COLUMNS 🟢
        
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
        
        // 🟢 NEW: RUN NET RUNNING HOURS CALCULATION 🟢
        const timeResults = calculateNetRunningHours(entry);
        // --- END CALCULATION LOGIC ---
        
        // Map data to Excel format
        return {
            ...entry, 
            embossing: entry.processes.includes('Embossing') ? 'Yes' : 'No',
            screenPrinting: entry.processes.includes('Screen Printing') ? 'Yes' : 'No',
            hotStamping: entry.processes.includes('Hot-Stamping') ? 'Yes' : 'No',
            labelling: entry.processes.includes('Labelling') ? 'Yes' : 'No',
            
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