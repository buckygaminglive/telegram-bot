const { jsPDF } = require('jspdf');
require('jspdf-autotable');

try {
    const doc = new jsPDF();
    doc.autoTable({ head: [['Test']], body: [['Row']] });
    console.log('Success!');
} catch (e) {
    console.error('Error in PDF generation:', e);
}
