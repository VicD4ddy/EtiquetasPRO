const { ipcRenderer } = require('electron');
const JsBarcode = require('jsbarcode');

function buildLabelNode(label) {
  const labelDiv = document.createElement('div');
  labelDiv.className = 'label-container';

  const title = document.createElement('div');
  title.className = 'header-bar';
  title.textContent = 'REPUESTOS SOTOMAYOR, C.A.';
  labelDiv.appendChild(title);

  const barcodeArea = document.createElement('div');
  barcodeArea.className = 'barcode-area';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'barcode-svg');
  barcodeArea.appendChild(svg);
  labelDiv.appendChild(barcodeArea);

  const codeText = String(label.code || '');
  const codeDiv = document.createElement('div');
  codeDiv.className = 'product-code';
  codeDiv.textContent = codeText;
  labelDiv.appendChild(codeDiv);

  const descDiv = document.createElement('div');
  descDiv.className = 'product-desc';
  descDiv.textContent = String(label.description || '');
  labelDiv.appendChild(descDiv);

  const footer = document.createElement('div');
  footer.className = 'footer-row';

  const details = document.createElement('div');
  details.className = 'details-box';

  const provLabel = document.createElement('span');
  provLabel.className = 'detail-label';
  provLabel.textContent = 'PROV: ';
  const provVal = document.createElement('span');
  provVal.className = 'detail-val';
  provVal.textContent = String(label.providerCode || '00000');
  const br = document.createElement('br');
  const dateLabel = document.createElement('span');
  dateLabel.className = 'detail-label';
  dateLabel.textContent = 'FECHA: ';
  const dateVal = document.createElement('span');
  dateVal.className = 'detail-val';
  dateVal.textContent = String(label.dateCode || '00/00');

  details.append(provLabel, provVal, br, dateLabel, dateVal);
  footer.appendChild(details);

  const cipher = document.createElement('div');
  cipher.className = 'cipher-badge';
  cipher.textContent = String(label.cipherCode || '');
  footer.appendChild(cipher);

  labelDiv.appendChild(footer);

  try {
    JsBarcode(svg, codeText || '000', {
      format: 'CODE128',
      width: 1.35,
      height: 45,
      displayValue: false,
      margin: 0
    });
  } catch (err) {
    console.error(`Error generando código de barras para ${codeText}:`, err);
  }

  return labelDiv;
}

ipcRenderer.on('print-data', (event, payload) => {
  const root = document.getElementById('labels-root');
  if (!root) return;

  const isObj = payload && !Array.isArray(payload);
  const jobId = isObj ? payload.jobId : null;
  const labels = isObj ? payload.labels || [] : Array.isArray(payload) ? payload : [];

  const fragment = document.createDocumentFragment();
  for (const label of labels) {
    fragment.appendChild(buildLabelNode(label));
  }
  root.replaceChildren(fragment);

  setTimeout(() => {
    ipcRenderer.send('ready-to-print', jobId);
  }, 40);
});
