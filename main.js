const SHEET_CONFIG = {
  science: '1AOaNghF-N8582jTLpLduC2aXsD31JZW-ad9A8_O-HHU',
  art: '1fI744Y_OP5uT12B-jP0K8O20XWrck-2dAkrVh0Z6qCc'
};

let chartInstance = null;
let distChartInstance = null;
let appData = null; // Store fetched data

function showStatus(msg, type = 'info') {
  const statusMsg = document.getElementById('statusMsg');
  statusMsg.textContent = msg;
  statusMsg.className = `alert alert-${type}`;
  statusMsg.style.display = 'block';
  document.getElementById('result').style.display = 'none';
}

async function searchScore() {
  const cid = document.getElementById('cid').value.trim();
  const btn = document.getElementById('searchBtn');
  
  if (!cid || cid.length !== 13) {
    showStatus('❌ กรุณากรอกเลขประจำตัวประชาชน 13 หลัก', 'error');
    return;
  }

  btn.innerHTML = '<div class="spinner"></div> กำลังค้นหา...';
  btn.disabled = true;
  document.getElementById('statusMsg').style.display = 'none';

  try {
    const sheetId = SHEET_CONFIG[BRANCH];
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=0`;
    
    const response = await fetch(url);
    const text = await response.text();
    
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonString);
    
    initData(data.table, cid);
    
  } catch (error) {
    console.error(error);
    showStatus('❌ เกิดข้อผิดพลาดในการเชื่อมต่อข้อมูล โปรดลองอีกครั้ง', 'error');
  } finally {
    btn.innerHTML = 'ค้นหาคะแนน';
    btn.disabled = false;
  }
}

function initData(table, cid) {
  const cols = table.cols;
  const rows = table.rows;
  
  const cidColIdx = cols.findIndex(c => c.label.includes('ประชาชน') || c.id === 'A');
  const nameColIdx = cols.findIndex(c => c.label.includes('ชื่อ') || c.id === 'C');
  const totalColIdx = cols.findIndex(c => c.label.includes('คะแนนรวมทุกวิชา') || c.label.includes('รวมทุกวิชา'));
  const rankColIdx = cols.findIndex(c => c.label.includes('ลำดับที่'));
  
  const subjectCols = [];
  cols.forEach((col, idx) => {
    if (col.label && col.label.includes('คะแนนวิชา')) {
      subjectCols.push({ idx, label: col.label.replace('คะแนนวิชา', '').trim() });
    }
  });

  const student = rows.find(r => r.c[cidColIdx] && String(r.c[cidColIdx].v).trim() === cid);
  
  if (!student) {
    showStatus('❌ ไม่พบข้อมูลนักเรียนที่มีเลขประจำตัวประชาชนนี้', 'error');
    return;
  }

  appData = {
    rows,
    student,
    cidColIdx,
    nameColIdx,
    totalColIdx,
    rankColIdx,
    subjectCols,
    cid
  };

  buildSubjectSelectors();
  updateCalculations();
}

function buildSubjectSelectors() {
  const container = document.getElementById('subjectSelectorContainer');
  const grid = document.getElementById('subjectCheckboxes');
  
  grid.innerHTML = '';
  appData.subjectCols.forEach(sub => {
    const label = document.createElement('label');
    label.className = 'checkbox-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = sub.idx;
    checkbox.checked = true; // Default select all
    checkbox.onchange = updateCalculations;
    
    const textNode = document.createTextNode(sub.label.replace(' (100)', ''));
    
    label.appendChild(checkbox);
    label.appendChild(textNode);
    grid.appendChild(label);
  });
  
  container.style.display = 'block';
}

function updateCalculations() {
  const selectedIndices = Array.from(document.querySelectorAll('#subjectCheckboxes input:checked')).map(cb => parseInt(cb.value));
  
  // 1. Calculate stats for ALL subjects to show in the table (ignore 0)
  const stats = appData.subjectCols.map(sub => {
    let sum = 0, count = 0, min = Infinity, max = -Infinity;
    const allScores = [];
    
    appData.rows.forEach(r => {
      const cell = r.c[sub.idx];
      if (cell && typeof cell.v === 'number' && cell.v > 0) { // ข้าม 0
        const val = cell.v;
        sum += val;
        count++;
        if (val < min) min = val;
        if (val > max) max = val;
        allScores.push(val);
      }
    });

    const avg = count > 0 ? sum / count : 0;
    
    let sumSqDiff = 0;
    allScores.forEach(val => {
      sumSqDiff += Math.pow(val - avg, 2);
    });
    const sd = count > 0 ? Math.sqrt(sumSqDiff / count) : 0;

    const cellData = appData.student.c[sub.idx];
    const studentScore = (cellData && typeof cellData.v === 'number') ? cellData.v : 0;

    return {
      label: sub.label,
      studentScore: studentScore,
      avg: avg,
      sd: sd,
      min: min !== Infinity ? min : 0,
      max: max !== -Infinity ? max : 0
    };
  });

  // 2. Calculate dynamic total score and ranking based on selected subjects
  const allTotals = [];
  appData.rows.forEach(r => {
    let rowTotal = 0;
    let hasValidScore = false;
    selectedIndices.forEach(idx => {
      const cell = r.c[idx];
      if (cell && typeof cell.v === 'number') {
        rowTotal += cell.v;
        if (cell.v > 0) hasValidScore = true;
      }
    });
    
    // นับจำนวนนักเรียนเฉพาะคนที่มีคะแนนอย่างน้อย 1 วิชาที่ไม่ใช่ 0 (ในกลุ่มที่เลือก)
    if (hasValidScore) {
      allTotals.push(rowTotal);
    }
  });

  allTotals.sort((a, b) => b - a);

  let studentTotal = 0;
  let studentHasValidScore = false;
  selectedIndices.forEach(idx => {
    const cell = appData.student.c[idx];
    if (cell && typeof cell.v === 'number') {
      studentTotal += cell.v;
      if (cell.v > 0) studentHasValidScore = true;
    }
  });

  let rank = 0;
  let totalStudents = allTotals.length;
  let percentile = 0;

  if (studentHasValidScore) {
    rank = allTotals.indexOf(studentTotal) + 1;
    percentile = Math.round(((totalStudents - rank + 1) / totalStudents) * 100);
  } else {
    rank = '-';
    percentile = 0;
  }

  const studentName = appData.student.c[appData.nameColIdx] ? appData.student.c[appData.nameColIdx].v : 'ไม่ระบุชื่อ';

  renderUI(studentName, appData.cid, stats, studentTotal, rank, totalStudents, percentile, allTotals);
}

function renderUI(name, cid, stats, totalScore, rank, totalStudents, percentile, allTotals) {
  document.getElementById('statusMsg').style.display = 'none';
  document.getElementById('result').style.display = 'block';

  document.getElementById('info').innerHTML = `
    <p class="info-name">${name}</p>
    <p>📄 เลขประจำตัวประชาชน: ${cid}</p>
  `;

  const tbody = document.getElementById('scoreBody');
  tbody.innerHTML = '';
  
  stats.forEach(stat => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align: left; padding-left: 20px;">${stat.label}</td>
      <td class="score-highlight">${stat.studentScore.toFixed(2)}</td>
      <td>${stat.avg.toFixed(2)}</td>
      <td>${stat.sd.toFixed(2)}</td>
      <td>${stat.max.toFixed(2)}</td>
      <td>${stat.min.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  const totalTr = document.createElement('tr');
  totalTr.className = 'table-total-row';
  totalTr.innerHTML = `
    <td style="text-align: left; padding-left: 20px; font-weight: bold;">รวมคะแนน (เฉพาะวิชาที่เลือก)</td>
    <td class="score-highlight" style="font-size: 1.2rem;">${totalScore.toFixed(2)}</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
  `;
  tbody.appendChild(totalTr);

  document.getElementById('rankCard').innerHTML = `
    <div class="rank-highlight">
      <div>ลำดับที่สอบได้ (เฉพาะวิชาที่เลือก)</div>
      <div class="rank-number">${rank}</div>
      <div>จากผู้เข้าสอบทั้งหมด ${totalStudents} คน</div>
    </div>
  `;

  document.getElementById('summaryText').innerHTML = `
    <div class="percentile-text">
      ${rank !== '-' ? `🌟 คุณอยู่ในกลุ่ม ${percentile}% สูงสุดของผู้เข้าสอบทั้งหมด` : 'คุณไม่มีคะแนนในวิชาที่เลือก'}
    </div>
  `;

  renderChart(stats);
  renderDistributionChart(allTotals, totalScore, rank !== '-');
}

function renderChart(stats) {
  const ctx = document.getElementById('scoreChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const labels = stats.map(s => s.label.replace(' (100)', '').substring(0, 15));
  const studentData = stats.map(s => s.studentScore);
  const avgData = stats.map(s => s.avg);
  const maxData = stats.map(s => s.max);

  const primaryColor = BRANCH === 'science' ? 'rgba(59, 130, 246, 0.8)' : 'rgba(245, 158, 11, 0.8)';
  const primaryBorder = BRANCH === 'science' ? '#2563eb' : '#d97706';

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'คะแนนของคุณ', data: studentData, backgroundColor: primaryColor, borderColor: primaryBorder, borderWidth: 1, borderRadius: 4 },
        { label: 'คะแนนเฉลี่ย', data: avgData, backgroundColor: 'rgba(148, 163, 184, 0.5)', borderColor: '#64748b', borderWidth: 1, borderRadius: 4 },
        { label: 'คะแนนสูงสุด', data: maxData, backgroundColor: 'rgba(16, 185, 129, 0.4)', borderColor: '#059669', borderWidth: 1, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: "'Prompt', sans-serif" } } },
        tooltip: { titleFont: { family: "'Prompt', sans-serif" }, bodyFont: { family: "'Prompt', sans-serif" } }
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { font: { family: "'Prompt', sans-serif" } } },
        x: { ticks: { font: { family: "'Prompt', sans-serif" }, maxRotation: 45, minRotation: 45 } }
      },
      animation: { duration: 1500, easing: 'easeOutQuart' }
    }
  });
}

function renderDistributionChart(allTotals, studentTotal, isValid) {
  const ctx = document.getElementById('distributionChart').getContext('2d');
  if (distChartInstance) distChartInstance.destroy();

  if (!isValid || allTotals.length === 0) return;

  // Create Histogram Buckets
  const minScore = Math.floor(Math.min(...allTotals) / 10) * 10;
  const maxScore = Math.ceil(Math.max(...allTotals) / 10) * 10;
  
  const bucketSize = (maxScore - minScore) > 100 ? 50 : 10;
  const buckets = {};
  
  for (let i = minScore; i <= maxScore; i += bucketSize) {
    buckets[i] = 0;
  }

  allTotals.forEach(score => {
    const bucket = Math.floor(score / bucketSize) * bucketSize;
    if (buckets[bucket] !== undefined) {
      buckets[bucket]++;
    }
  });

  const labels = Object.keys(buckets).map(k => `${k}-${parseInt(k) + bucketSize - 1}`);
  const data = Object.values(buckets);

  // Find student's bucket index
  const studentBucket = Math.floor(studentTotal / bucketSize) * bucketSize;
  const studentIndex = Object.keys(buckets).indexOf(String(studentBucket));

  const primaryColor = BRANCH === 'science' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(245, 158, 11, 0.5)';
  const highlightColor = BRANCH === 'science' ? 'rgba(37, 99, 235, 1)' : 'rgba(217, 119, 6, 1)';

  const backgroundColors = data.map((_, idx) => idx === studentIndex ? highlightColor : primaryColor);
  
  // Custom Point Style (Emoji on Scatter overlay)
  const personImage = new Image();
  // Using an SVG data URI to render emoji cleanly on canvas
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><text x="0" y="24" font-size="24">🧍‍♂️</text></svg>`;
  personImage.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

  // Scatter data for the student icon overlay
  const scatterData = [];
  if (studentIndex !== -1) {
    scatterData.push({ x: studentIndex, y: data[studentIndex] + Math.max(...data)*0.05 }); // Float slightly above the bar
  }

  personImage.onload = () => {
    distChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            type: 'scatter',
            label: 'ตำแหน่งของคุณ',
            data: scatterData,
            pointStyle: personImage,
            pointRadius: 15,
            pointHoverRadius: 20
          },
          {
            type: 'bar',
            label: 'จำนวนนักเรียน',
            data: data,
            backgroundColor: backgroundColors,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { family: "'Prompt', sans-serif" } } },
          tooltip: {
            titleFont: { family: "'Prompt', sans-serif" },
            bodyFont: { family: "'Prompt', sans-serif" },
            callbacks: {
              label: function(context) {
                if (context.dataset.type === 'scatter') return 'คะแนนของคุณอยู่ที่ช่วงนี้';
                return `จำนวน: ${context.raw} คน`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { font: { family: "'Prompt', sans-serif" }, stepSize: 1 }
          },
          x: {
            ticks: { font: { family: "'Prompt', sans-serif" } }
          }
        },
        animation: { duration: 1500, easing: 'easeOutQuart' }
      }
    });
  };
}
