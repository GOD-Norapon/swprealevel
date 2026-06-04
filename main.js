const SHEET_CONFIG = {
  science: '1AOaNghF-N8582jTLpLduC2aXsD31JZW-ad9A8_O-HHU',
  art: '1fI744Y_OP5uT12B-jP0K8O20XWrck-2dAkrVh0Z6qCc'
};

let chartInstance = null;

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

  // UI Loading State
  btn.innerHTML = '<div class="spinner"></div> กำลังค้นหา...';
  btn.disabled = true;
  document.getElementById('statusMsg').style.display = 'none';

  try {
    const sheetId = SHEET_CONFIG[BRANCH];
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&gid=0`;
    
    const response = await fetch(url);
    const text = await response.text();
    
    // Parse Google Visualization JSON
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const data = JSON.parse(jsonString);
    
    processData(data.table, cid);
    
  } catch (error) {
    console.error(error);
    showStatus('❌ เกิดข้อผิดพลาดในการเชื่อมต่อข้อมูล โปรดลองอีกครั้ง', 'error');
  } finally {
    btn.innerHTML = 'ค้นหาคะแนน';
    btn.disabled = false;
  }
}

function processData(table, cid) {
  const cols = table.cols;
  const rows = table.rows;
  
  // Find column indices
  const cidColIdx = cols.findIndex(c => c.label.includes('ประชาชน') || c.id === 'A');
  const nameColIdx = cols.findIndex(c => c.label.includes('ชื่อ') || c.id === 'C');
  const totalColIdx = cols.findIndex(c => c.label.includes('คะแนนรวมทุกวิชา') || c.label.includes('รวมทุกวิชา'));
  const rankColIdx = cols.findIndex(c => c.label.includes('ลำดับที่'));
  
  // Identify subject columns
  const subjectCols = [];
  cols.forEach((col, idx) => {
    if (col.label && col.label.includes('คะแนนวิชา')) {
      subjectCols.push({ idx, label: col.label.replace('คะแนนวิชา', '').trim() });
    }
  });

  // Find student
  const student = rows.find(r => r.c[cidColIdx] && String(r.c[cidColIdx].v).trim() === cid);
  
  if (!student) {
    showStatus('❌ ไม่พบข้อมูลนักเรียนที่มีเลขประจำตัวประชาชนนี้', 'error');
    return;
  }

  // Calculate statistics
  const stats = subjectCols.map(sub => {
    let sum = 0, count = 0, min = Infinity, max = -Infinity;
    const allScores = [];
    
    rows.forEach(r => {
      const cell = r.c[sub.idx];
      if (cell && typeof cell.v === 'number') {
        const val = cell.v;
        sum += val;
        count++;
        if (val < min) min = val;
        if (val > max) max = val;
        allScores.push(val);
      }
    });

    const avg = count > 0 ? sum / count : 0;
    
    // Calculate SD
    let sumSqDiff = 0;
    allScores.forEach(val => {
      sumSqDiff += Math.pow(val - avg, 2);
    });
    const sd = count > 0 ? Math.sqrt(sumSqDiff / count) : 0;

    const studentScore = student.c[sub.idx] ? student.c[sub.idx].v : 0;

    return {
      label: sub.label,
      studentScore: studentScore,
      avg: avg,
      sd: sd,
      min: min !== Infinity ? min : 0,
      max: max !== -Infinity ? max : 0
    };
  });

  // Calculate total students & percentile
  const totalStudents = rows.filter(r => r.c[nameColIdx] && r.c[nameColIdx].v).length;
  let rank = student.c[rankColIdx] ? student.c[rankColIdx].v : 0;
  
  // Fallback rank calculation if not provided
  const totalScore = student.c[totalColIdx] ? student.c[totalColIdx].v : 0;
  if (!rank || rank === 0) {
    const allTotals = rows.map(r => r.c[totalColIdx] ? r.c[totalColIdx].v : 0).sort((a, b) => b - a);
    rank = allTotals.indexOf(totalScore) + 1;
  }
  
  const percentile = Math.round(((totalStudents - rank + 1) / totalStudents) * 100);
  const studentName = student.c[nameColIdx] ? student.c[nameColIdx].v : 'ไม่ระบุชื่อ';

  // Display UI
  renderUI(studentName, cid, stats, totalScore, rank, totalStudents, percentile);
}

function renderUI(name, cid, stats, totalScore, rank, totalStudents, percentile) {
  document.getElementById('statusMsg').style.display = 'none';
  document.getElementById('result').style.display = 'block';

  // Info
  document.getElementById('info').innerHTML = `
    <p class="info-name">${name}</p>
    <p>📄 เลขประจำตัวประชาชน: ${cid}</p>
  `;

  // Table
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

  // Total row
  const totalTr = document.createElement('tr');
  totalTr.className = 'table-total-row';
  totalTr.innerHTML = `
    <td style="text-align: left; padding-left: 20px; font-weight: bold;">รวมทุกวิชา</td>
    <td class="score-highlight" style="font-size: 1.2rem;">${totalScore.toFixed(2)}</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
    <td>-</td>
  `;
  tbody.appendChild(totalTr);

  // Rank
  document.getElementById('rankCard').innerHTML = `
    <div class="rank-highlight">
      <div>ลำดับที่สอบได้</div>
      <div class="rank-number">${rank}</div>
      <div>จากผู้เข้าสอบทั้งหมด ${totalStudents} คน</div>
    </div>
  `;

  document.getElementById('summaryText').innerHTML = `
    <div class="percentile-text">
      🌟 คุณอยู่ในกลุ่ม ${percentile}% สูงสุดของผู้เข้าสอบทั้งหมด
    </div>
  `;

  // Render Chart
  renderChart(stats);
}

function renderChart(stats) {
  const ctx = document.getElementById('scoreChart').getContext('2d');
  
  if (chartInstance) {
    chartInstance.destroy();
  }

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
        {
          label: 'คะแนนของคุณ',
          data: studentData,
          backgroundColor: primaryColor,
          borderColor: primaryBorder,
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'คะแนนเฉลี่ย',
          data: avgData,
          backgroundColor: 'rgba(148, 163, 184, 0.5)',
          borderColor: '#64748b',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'คะแนนสูงสุด',
          data: maxData,
          backgroundColor: 'rgba(16, 185, 129, 0.4)',
          borderColor: '#059669',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: {
              family: "'Prompt', sans-serif"
            }
          }
        },
        tooltip: {
          titleFont: { family: "'Prompt', sans-serif" },
          bodyFont: { family: "'Prompt', sans-serif" }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            font: { family: "'Prompt', sans-serif" }
          }
        },
        x: {
          ticks: {
            font: { family: "'Prompt', sans-serif" },
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      animation: {
        duration: 1500,
        easing: 'easeOutQuart'
      }
    }
  });
}
