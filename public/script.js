document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const selectionScreen = document.getElementById('selectionScreen');
    const formScreen = document.getElementById('formScreen');
    const printScreen = document.getElementById('printScreen');
    const printContent = document.getElementById('printContent');

    // Buttons
    const selectAsb1Btn = document.getElementById('selectAsb1');
    const selectAsb2Btn = document.getElementById('selectAsb2');
    const backButton = document.getElementById('backButton');
    const printReportButton = document.getElementById('printReportButton');
    const printButtonContainer = document.getElementById('printButtonContainer');
    const backFromPrintButton = document.getElementById('backFromPrintButton');

    // Form Elements
    const form = document.getElementById('productionForm');
    const formTitle = document.getElementById('formTitle');
    const sectionInput = document.getElementById('section');
    const customerDatalist = document.getElementById('customer-list');
    const statusMessage = document.getElementById('statusMessage');

    // --- Configuration ---
    const WEIGHTS = {
        'ASB 1 (PET)': 0.706, 
        'ASB 2 (PC)': 0.820
    };

    // --- Helper: Time to Minutes ---
    function timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // --- Logic: Calculate Net Running Hours ---
    function calculateNetRunningHours() {
        const shiftStartInput = document.getElementById('shiftStart').value;
        const shiftEndInput = document.getElementById('shiftEnd').value;
        const netRunningHoursResultElement = document.getElementById('netRunningHoursResult');
        const netRunningHoursInputElement = document.getElementById('netRunningHoursInput');
        
        if (!shiftStartInput || !shiftEndInput) {
            if(netRunningHoursResultElement) netRunningHoursResultElement.textContent = '0.00 Hours';
            if(netRunningHoursInputElement) netRunningHoursInputElement.value = 0;
            return;
        }

        let startMinutes = timeToMinutes(shiftStartInput);
        let endMinutes = timeToMinutes(shiftEndInput);
        
        let totalShiftDurationMinutes = endMinutes - startMinutes;
        if (totalShiftDurationMinutes < 0) totalShiftDurationMinutes += 24 * 60; // Handle overnight

        let totalDowntimeMinutes = 0;
        
        for (let i = 1; i <= 2; i++) {
            const startElem = document.getElementById(`breakdownStart${i}`);
            const endElem = document.getElementById(`breakdownEnd${i}`);
            
            if (startElem && endElem && startElem.value && endElem.value) {
                let breakStart = timeToMinutes(startElem.value);
                let breakEnd = timeToMinutes(endElem.value);
                
                if (breakEnd < breakStart) breakEnd += 24 * 60; // Handle overnight breakdown
                
                const duration = breakEnd - breakStart;
                if (duration > 0) totalDowntimeMinutes += duration;
            }
        }
        
        const netRunningTimeMinutes = Math.max(0, totalShiftDurationMinutes - totalDowntimeMinutes);
        const netRunningHours = netRunningTimeMinutes / 60;
        
        if(netRunningHoursResultElement) netRunningHoursResultElement.textContent = netRunningHours.toFixed(2) + ' Hours';
        if(netRunningHoursInputElement) netRunningHoursInputElement.value = netRunningHours.toFixed(2);
    }

    // --- Logic: Calculate Wastage ---
    function calculateWastage() {
        const section = sectionInput.value;
        // Strip " (PET)" or " (PC)" to match keys if necessary, or ensure exact match in WEIGHTS
        // Currently your buttons send 'ASB 1 (PET)' which matches keys.
        const pieceWeight = WEIGHTS[section] || 0.706; // Default fallback if undefined

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

        const wastageElement = document.getElementById('wastageResult');
        if(wastageElement) {
            wastageElement.textContent = wastagePercentage.toFixed(2) + '%';
            if (wastagePercentage > 3) {
                wastageElement.style.color = '#ff4d4d'; 
            } else {
                wastageElement.style.color = 'var(--primary-green)'; 
            }
        }
    }

    // --- Event Listeners: Auto-Calculate ---
    const calcEvents = [
        'shift', 'shiftStart', 'shiftEnd', 
        'breakdownStart1', 'breakdownEnd1', 'breakdownStart2', 'breakdownEnd2',
        'goodBottles', 'rejectedBottles', 'preform', 'lumpsKg'
    ];
    calcEvents.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                calculateNetRunningHours();
                calculateWastage();
            });
        }
    });

    // --- API: Fetch Customers ---
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

    // --- Navigation: Show Form ---
    function showForm(sectionName) {
        formTitle.textContent = `${sectionName} - Production Log`;
        sectionInput.value = sectionName; // "ASB 1 (PET)" or "ASB 2 (PC)"
        
        statusMessage.textContent = ''; 
        printButtonContainer.style.display = 'none';
        selectionScreen.style.display = 'none';
        formScreen.style.display = 'block';
        printScreen.style.display = 'none';
        
        // Reset and Prep
        form.reset();
        fetchCustomers();
        calculateWastage(); 
        calculateNetRunningHours(); 
    }

    // --- Navigation Listeners ---
    if(selectAsb1Btn) selectAsb1Btn.addEventListener('click', () => showForm('ASB 1 (PET)'));
    if(selectAsb2Btn) selectAsb2Btn.addEventListener('click', () => showForm('ASB 2 (PC)'));
    
    if(backButton) backButton.addEventListener('click', () => {
        form.reset();
        formScreen.style.display = 'none';
        selectionScreen.style.display = 'block';
        printButtonContainer.style.display = 'none';
    });

    // --- SUBMIT LOGIC ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Basic Client-side Validation
        if (!form.reportValidity()) {
            statusMessage.textContent = 'Error: Please fill in all required fields.';
            statusMessage.style.color = '#ff8a80'; 
            return;
        }

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data.processes = formData.getAll('processes'); // Capture checkboxes as array

        // Force calculations to be up-to-date in the data object
        data.wastagePercentage = document.getElementById('wastageResult').textContent;
        data.netRunningHours = document.getElementById('netRunningHoursInput').value;

        // Convert numeric strings to numbers
        const numericFields = ['virginKg', 'regrindKg', 'lumpsKg', 'goodBottles', 'rejectedBottles', 'preform'];
        numericFields.forEach(field => {
            data[field] = data[field] ? parseFloat(data[field]) : 0;
        });

        try {
            const response = await fetch('/submit-production', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();

            if (response.ok) {
                statusMessage.textContent = result.message + ' You can now print this report.';
                statusMessage.style.color = 'var(--primary-green)';
                // DO NOT RESET FORM HERE so user can print
                printButtonContainer.style.display = 'flex'; 
            } else {
                throw new Error(result.message || 'Failed to save data');
            }
        } catch (error) {
            statusMessage.textContent = `Error: ${error.message}`;
            statusMessage.style.color = '#ff8a80'; 
            printButtonContainer.style.display = 'none';
        }
    });

    // --- PRINT GENERATION LOGIC ---
    function generatePrintContent(data) {
        // 🟢 SAFE ARRAY HANDLING: Prevent .join() error
        // If data.processes is undefined or not an array, default to empty array
        const processesList = (Array.isArray(data.processes) && data.processes.length > 0) 
            ? data.processes.join(', ') 
            : 'None';

        return `
            <style>
                @media print {
                    body { background: #fff !important; color: #000 !important; }
                    .container { border: none; box-shadow: none; padding: 0; margin: 0; width: 100%; max-width: 100%; }
                    h1 { text-align: center; font-size: 1.5rem; margin-bottom: 20px; color: #000; }
                    h2 { font-size: 1.2rem; border-bottom: 2px solid #000; margin-top: 20px; padding-bottom: 5px; color: #000; }
                    .print-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
                    .print-item { border-bottom: 1px dotted #ccc; padding: 5px 0; font-size: 0.95rem; }
                    .print-item strong { margin-right: 5px; }
                    .full-width { grid-column: 1 / -1; }
                    .print-highlight { font-weight: bold; }
                }
            </style>
            
            <h1>Production Report - ${data.section}</h1>
            
            <h2>1. Shift & Runtime</h2>
            <div class="print-grid">
                <div class="print-item"><strong>Date:</strong> ${data.date}</div>
                <div class="print-item"><strong>Shift:</strong> ${data.shift}</div>
                <div class="print-item"><strong>Start:</strong> ${data.shiftStart}</div>
                <div class="print-item"><strong>End:</strong> ${data.shiftEnd}</div>
                <div class="print-item"><strong>Net Running Hours:</strong> ${data.netRunningHours || '0.00'} Hours</div>
                <div class="print-item"><strong>Incharge:</strong> ${data.shiftIncharge || '-'}</div>
                <div class="print-item"><strong>Operator:</strong> ${data.operator || '-'}</div>
                <div class="print-item"><strong>Helpers:</strong> ${data.helpers || '-'}</div>
            </div>

            <h2>2. Downtime</h2>
            <div class="print-grid">
                <div class="print-item"><strong>Stop 1:</strong> ${data.breakdownStart1 || '-'}</div>
                <div class="print-item"><strong>Start 1:</strong> ${data.breakdownEnd1 || '-'}</div>
                <div class="print-item full-width"><strong>Reason 1:</strong> ${data.breakdownReason1 || '-'}</div>
                <div class="print-item"><strong>Stop 2:</strong> ${data.breakdownStart2 || '-'}</div>
                <div class="print-item"><strong>Start 2:</strong> ${data.breakdownEnd2 || '-'}</div>
                <div class="print-item full-width"><strong>Reason 2:</strong> ${data.breakdownReason2 || '-'}</div>
            </div>

            <h2>3. Job Details</h2>
            <div class="print-grid">
                <div class="print-item"><strong>Customer:</strong> ${data.customerName || '-'}</div>
                <div class="print-item"><strong>Brand:</strong> ${data.brand || '-'}</div>
                <div class="print-item"><strong>Mold Type:</strong> ${data.moldType || '-'}</div>
                <div class="print-item"><strong>Wall Thickness:</strong> ${data.wallThickness || '-'}</div>
                <div class="print-item"><strong>Date Insert:</strong> ${data.dateInsert || '-'}</div>
                <div class="print-item"><strong>Bottom Mold/Cooling:</strong> ${data.bottomMoldCooling || '-'}</div>
                <div class="print-item"><strong>Bottle Strength:</strong> ${data.bottleGeneralStrength || '-'}</div>
            </div>

            <h2>4. Material & Output</h2>
            <div class="print-grid">
                <div class="print-item"><strong>Resin Grade:</strong> ${data.resinGrade || '-'}</div>
                <div class="print-item"><strong>Virgin (KG):</strong> ${data.virginKg || '0'}</div>
                <div class="print-item"><strong>Regrind (KG):</strong> ${data.regrindKg || '0'}</div>
                <div class="print-item"><strong>Good Bottles:</strong> ${data.goodBottles || '0'}</div>
                <div class="print-item"><strong>Rejected Bottles:</strong> ${data.rejectedBottles || '0'}</div>
                <div class="print-item"><strong>Preform:</strong> ${data.preform || '0'}</div>
                <div class="print-item"><strong>Lump (KG):</strong> ${data.lumpsKg || '0'}</div>
                <div class="print-item"><strong>Wastage (%):</strong> ${data.wastagePercentage || '0.00%'}</div>
            </div>

            <h2>5. Post-Production & Notes</h2>
            <div class="print-grid">
                <div class="print-item full-width"><strong>Processes:</strong> ${processesList}</div>
            </div>
            <div style="margin-top: 15px;">
                <strong>Operator Notes:</strong>
                <p style="white-space: pre-wrap; border: 1px solid #ccc; padding: 10px;">${data.operatorNotes || 'No notes.'}</p>
            </div>
        `;
    }

    // --- PRINT LISTENERS ---
    if(printReportButton) {
        printReportButton.addEventListener('click', async () => {
            try {
                const response = await fetch('/get-last-record');
                const lastRecord = await response.json();
                
                // Hide Form, Show Print
                formScreen.style.display = 'none';
                printScreen.style.display = 'block';
                
                printContent.innerHTML = generatePrintContent(lastRecord);
                
                window.print();
            } catch (error) {
                alert('Error fetching record: ' + error.message);
            }
        });
    }

    if(backFromPrintButton) {
        backFromPrintButton.addEventListener('click', () => {
            printScreen.style.display = 'none';
            formScreen.style.display = 'block';
        });
    }

    // Initial Load
    fetchCustomers();
});