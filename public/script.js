document.addEventListener('DOMContentLoaded', () => {
    // Screens
    const selectionScreen = document.getElementById('selectionScreen');
    const formScreen = document.getElementById('formScreen');
    const printScreen = document.getElementById('printScreen'); // 🟢 NEW
    const printContent = document.getElementById('printContent'); // 🟢 NEW

    // Buttons
    const selectAsb1Btn = document.getElementById('selectAsb1');
    const selectAsb2Btn = document.getElementById('selectAsb2');
    const backButton = document.getElementById('backButton');
    const printReportButton = document.getElementById('printReportButton'); // 🟢 NEW
    const printButtonContainer = document.getElementById('printButtonContainer'); // 🟢 NEW
    const backFromPrintButton = document.getElementById('backFromPrintButton'); // 🟢 NEW

    // Form
    const form = document.getElementById('productionForm');
    const formTitle = document.getElementById('formTitle');
    const sectionInput = document.getElementById('section');
    const customerDatalist = document.getElementById('customer-list');
    const statusMessage = document.getElementById('statusMessage');

    // --- Calculation Weights ---
    const WEIGHTS = {
        'ASB 1 (PET)': 0.706, // Weight of 1 piece in KG
        'ASB 2 (PC)': 0.820,  // Weight of 1 piece in KG
    };
    
    // --- Helper Function: Convert "HH:MM" to total minutes from midnight ---
    function timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // 🟢 NEW: Net Running Hours Calculation Logic
    function calculateNetRunningHours() {
        const shiftStartInput = document.getElementById('shiftStart').value;
        const shiftEndInput = document.getElementById('shiftEnd').value;
        const netRunningHoursResultElement = document.getElementById('netRunningHoursResult');
        const netRunningHoursInputElement = document.getElementById('netRunningHoursInput');
        
        if (!shiftStartInput || !shiftEndInput) {
            netRunningHoursResultElement.textContent = '0.00 Hours';
            netRunningHoursInputElement.value = 0;
            return;
        }

        let startMinutes = timeToMinutes(shiftStartInput);
        let endMinutes = timeToMinutes(shiftEndInput);
        
        // 1. Calculate Total Planned Shift Duration
        let totalShiftDurationMinutes = endMinutes - startMinutes;
        
        // Handle overnight shift (if end time is less than start time)
        if (totalShiftDurationMinutes < 0) {
            totalShiftDurationMinutes += 24 * 60; // Add 24 hours
        }

        if (totalShiftDurationMinutes <= 0) {
            netRunningHoursResultElement.textContent = '0.00 Hours (Check Times)';
            netRunningHoursInputElement.value = 0;
            return;
        }
        
        // 2. Calculate Total Downtime
        let totalDowntimeMinutes = 0;
        
        // Loop through the two potential breakdown entries
        for (let i = 1; i <= 2; i++) {
            const breakdownStartStr = document.getElementById(`breakdownStart${i}`).value;
            const breakdownEndStr = document.getElementById(`breakdownEnd${i}`).value;

            if (breakdownStartStr && breakdownEndStr) {
                let breakStartMinutes = timeToMinutes(breakdownStartStr);
                let breakEndMinutes = timeToMinutes(breakdownEndStr);
                
                // If breakdown end time is earlier than start time, assume it crosses midnight
                if (breakEndMinutes < breakStartMinutes) {
                    breakEndMinutes += 24 * 60; 
                }
                
                const duration = breakEndMinutes - breakStartMinutes;
                if (duration > 0) {
                    totalDowntimeMinutes += duration;
                }
            }
        }
        
        // 3. Calculate Net Running Time
        const netRunningTimeMinutes = Math.max(0, totalShiftDurationMinutes - totalDowntimeMinutes);
        const netRunningHours = netRunningTimeMinutes / 60;
        
        // 4. Update Display and Hidden Input
        netRunningHoursResultElement.textContent = netRunningHours.toFixed(2) + ' Hours';
        netRunningHoursInputElement.value = netRunningHours.toFixed(2);
    }
    // 🟢 END: Net Running Hours Calculation Logic
    
    // --- Wastage Calculation Logic (Remains the same) ---
    function calculateWastage() {
        const section = sectionInput.value;
        const pieceWeight = WEIGHTS[section];
        const wastageResultElement = document.getElementById('wastageResult');

        if (!pieceWeight) {
            wastageResultElement.textContent = 'N/A';
            return;
        }

        const G = parseFloat(document.getElementById('goodBottles').value) || 0;
        const R = parseFloat(document.getElementById('rejectedBottles').value) || 0;
        const P = parseFloat(document.getElementById('preform').value) || 0;
        const L = parseFloat(document.getElementById('lumpsKg').value) || 0;

        const goodKg = G * pieceWeight;
        const rejectedKg = R * pieceWeight;
        const preformKg = P * pieceWeight; 
        const totalWastageKg = rejectedKg + preformKg + L;
        const totalInputKg = goodKg + totalWastageKg;

        let wastagePercentage = 0;
        if (totalInputKg > 0) {
            wastagePercentage = (totalWastageKg / totalInputKg) * 100;
        }

        wastageResultElement.textContent = wastagePercentage.toFixed(2) + '%';
        
        if (wastagePercentage > 3) {
            wastageResultElement.style.color = '#ff4d4d'; // Red
        } else {
            wastageResultElement.style.color = 'var(--primary-green)'; 
        }
    }

    // Event Listeners for calculations
    const timeInputIds = ['shift', 'shiftStart', 'shiftEnd', 'breakdownStart1', 'breakdownEnd1', 'breakdownStart2', 'breakdownEnd2'];
    timeInputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', calculateNetRunningHours);
        }
    });

    const calculationInputIds = ['goodBottles', 'rejectedBottles', 'preform', 'lumpsKg'];
    calculationInputIds.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', calculateWastage);
        }
    });

    // --- Fetch Customers (Unchanged) ---
    async function fetchCustomers() {
        try {
            const response = await fetch('/get-customers');
            const customers = await response.json();
            
            customerDatalist.innerHTML = ''; 
            customers.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer;
                customerDatalist.appendChild(option);
            });
        } catch (error) {
            console.error('Error fetching customers:', error);
        }
    }

    // --- Show Form Function (Updated) ---
    function showForm(sectionName) {
        formTitle.textContent = `${sectionName} - Production Log`;
        sectionInput.value = sectionName;
        
        statusMessage.textContent = ''; 
        printButtonContainer.style.display = 'none'; // Hide print button initially

        selectionScreen.style.display = 'none';
        formScreen.style.display = 'block';
        printScreen.style.display = 'none'; // Ensure print screen is hidden
        
        fetchCustomers();
        calculateWastage(); 
        calculateNetRunningHours(); 
    }

    // --- Print Logic --- 🟢 NEW FUNCTION
    function generatePrintContent(data) {
        let content = `
            <style>
                @media print {
                    /* Reset styles for printing */
                    body { background: #fff !important; color: #000 !important; }
                    .container { box-shadow: none !important; border: 1px solid #ccc; padding: 15px; margin: 0; }
                    .no-print { display: none !important; }
                    h1 { color: #000 !important; font-size: 1.5rem; text-align: center; margin-bottom: 20px; }
                    h2 { font-size: 1.2rem; border-bottom: 2px solid #000; padding-bottom: 5px; margin-top: 20px; }
                    .print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
                    .print-item { border-bottom: 1px dotted #ccc; padding: 5px 0; }
                    .print-item strong { display: block; font-size: 0.8rem; color: #555; }
                    .print-highlight { font-weight: bold; color: #008037; font-size: 1.1rem; }
                }
            </style>
            <h1>Production Report - ${data.section}</h1>
            
            <h2>1. Shift & Runtime Details</h2>
            <div class="print-grid">
                <div class="print-item"><strong>Date:</strong> ${data.date}</div>
                <div class="print-item"><strong>Shift:</strong> ${data.shift}</div>
                <div class="print-item"><strong>Start Time:</strong> ${data.shiftStart}</div>
                <div class="print-item"><strong>End Time:</strong> ${data.shiftEnd}</div>
                <div class="print-item"><strong>Net Running Hours:</strong> <span class="print-highlight">${data.netRunningHours || '0.00'} Hours</span></div>
                <div class="print-item"><strong>Shift Incharge:</strong> ${data.shiftIncharge || '-'}</div>
            </div>
            
            <h2>2. Downtime & Reasons</h2>
            <div class="print-grid">
                <div class="print-item"><strong>Stop 1 Time:</strong> ${data.breakdownStart1 || '-'}</div>
                <div class="print-item"><strong>Start 1 Time:</strong> ${data.breakdownEnd1 || '-'}</div>
                <div style="grid-column: 1 / -1;" class="print-item"><strong>Reason 1:</strong> ${data.breakdownReason1 || '-'}</div>
                <div class="print-item"><strong>Stop 2 Time:</strong> ${data.breakdownStart2 || '-'}</div>
                <div class="print-item"><strong>Start 2 Time:</strong> ${data.breakdownEnd2 || '-'}</div>
                <div style="grid-column: 1 / -1;" class="print-item"><strong>Reason 2:</strong> ${data.breakdownReason2 || '-'}</div>
            </div>

            <h2>3. Job & Quality Details</h2>
            <div class="print-grid">
                <div class="print-item"><strong>Customer:</strong> ${data.customerName}</div>
                <div class="print-item"><strong>Brand:</strong> ${data.brand || '-'}</div>
                <div class="print-item"><strong>Mold Type:</strong> ${data.moldType || '-'}</div>
                <div class="print-item"><strong>Wall Thickness:</strong> ${data.wallThickness}</div>
                <div class="print-item"><strong>Date Insert:</strong> ${data.dateInsert}</div>
                <div class="print-item"><strong>Bottom Mold/Cooling:</strong> ${data.bottomMoldCooling}</div>
                <div class="print-item"><strong>Bottle Strength:</strong> ${data.bottleGeneralStrength}</div>
            </div>
            
            <h2>4. Output & Materials</h2>
            <div class="print-grid">
                <div class="print-item"><strong>Good Bottles (Pcs):</strong> ${data.goodBottles}</div>
                <div class="print-item"><strong>Rejected Bottles (Pcs):</strong> ${data.rejectedBottles || 0}</div>
                <div class="print-item"><strong>Preform (Pcs):</strong> ${data.preform || 0}</div>
                <div class="print-item"><strong>LUMP (KG):</strong> ${data.lumpsKg || 0}</div>
                <div class="print-item"><strong>Wastage (%):</strong> <span class="print-highlight">${data.wastagePercentage}</span></div>
                <div class="print-item"><strong>Resin / Grade:</strong> ${data.resinGrade || '-'}</div>
                <div class="print-item"><strong>Virgin (KG):</strong> ${data.virginKg || 0}</div>
                <div class="print-item"><strong>Regrind (KG):</strong> ${data.regrindKg || 0}</div>
            </div>

            <h2>5. Post-Production & Notes</h2>
            <div class="print-grid">
                <div class="print-item"><strong>Processes:</strong> ${data.processes.join(', ') || 'None'}</div>
            </div>
            <div style="margin-top: 15px;">
                <strong>Operator Notes:</strong>
                <p style="white-space: pre-wrap; margin-top: 5px; border: 1px solid #ccc; padding: 10px; min-height: 80px;">${data.operatorNotes || 'No notes provided.'}</p>
            </div>
        `;
        return content;
    }
    
    // --- Event Listeners ---
    selectAsb1Btn.addEventListener('click', () => showForm('ASB 1 (PET)'));
    selectAsb2Btn.addEventListener('click', () => showForm('ASB 2 (PC)'));
    backButton.addEventListener('click', () => {
        formScreen.style.display = 'none';
        selectionScreen.style.display = 'block';
        printButtonContainer.style.display = 'none';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        data.processes = formData.getAll('processes');
        
        // --- Convert numbers ---
        data.virginKg = parseFloat(data.virginKg) || 0;
        data.regrindKg = parseFloat(data.regrindKg) || 0;
        data.lumpsKg = parseFloat(data.lumpsKg) || 0;
        
        data.goodBottles = parseInt(data.goodBottles) || 0;
        data.rejectedBottles = parseInt(data.rejectedBottles) || 0;
        data.preform = parseInt(data.preform) || 0;

        // Capture live calculated values
        const wastagePercentage = document.getElementById('wastageResult').textContent;
        data.wastagePercentage = wastagePercentage;
        // netRunningHours is captured via the hidden input data.netRunningHours

        // Send data to the server
        try {
            const response = await fetch('/submit-production', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok) {
                statusMessage.textContent = result.message + ' You can now print this report.';
                statusMessage.style.color = 'var(--primary-green)';
                form.reset();
                calculateWastage(); 
                calculateNetRunningHours(); 
                printButtonContainer.style.display = 'flex'; // 🟢 Show the print button on success
            } else {
                throw new Error(result.message || 'Failed to save data');
            }
        } catch (error) {
            statusMessage.textContent = `Error: ${error.message}`;
            statusMessage.style.color = '#ff8a80'; 
            printButtonContainer.style.display = 'none';
        }
    });
    
    // 🟢 Event listener for the Print Button
    printReportButton.addEventListener('click', async () => {
        try {
            const response = await fetch('/get-last-record');
            const lastRecord = await response.json();
            
            // 1. Hide the form screen
            formScreen.style.display = 'none';
            
            // 2. Show the print screen
            printScreen.style.display = 'block';
            
            // 3. Populate content
            printContent.innerHTML = generatePrintContent(lastRecord);
            
            // 4. Trigger print dialog
            window.print();
            
        } catch (error) {
            alert('Error fetching last record for printing: ' + error.message);
        }
    });

    // 🟢 Event listener to go back from print screen
    backFromPrintButton.addEventListener('click', () => {
        printScreen.style.display = 'none';
        formScreen.style.display = 'block';
    });


    // Initial fetch of customers
    fetchCustomers();
});