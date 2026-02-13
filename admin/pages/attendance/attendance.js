const chartRange = document.getElementById("chartRange");
const chartCustom = document.getElementById("chartCustom");
const chartFrom = document.getElementById("chartFrom");
const chartTo = document.getElementById("chartTo");
const chartApply = document.getElementById("chartApply");
const tableBody = document.getElementById("tableBody");
const search = document.getElementById("search");
const filterStatus = document.getElementById("filterStatus");
const modalBg = document.getElementById("modalBg");
const openAdd = document.getElementById("openAdd");
const closeModal = document.getElementById("closeModal");
const saveAttendance = document.getElementById("saveAttendance");

let records = [];

function seed() {
  const today = new Date().toISOString().slice(0,10);
  records = [
    {date: today, name: "ANJALI", status: "Present", in: "10:00", out: "18:00", hours: 8, salary: 600},
    {date: today, name: "MANISHA", status: "Absent", in: "-", out: "-", hours: 0, salary: 0},
    {date: today, name: "SANDEEP", status: "Present", in: "09:30", out: "17:30", hours: 8, salary: 700}
  ];
}

function renderTable() {
  const q = (search.value || "").toLowerCase();
  const f = filterStatus.value;
  tableBody.innerHTML = "";
  records.forEach(r => {
    if (q && !(r.name.toLowerCase().includes(q) || r.date.includes(q))) return;
    if (f !== "all" && r.status !== f) return;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.name}</td>
      <td>${r.status}</td>
      <td>${r.in}</td>
      <td>${r.out}</td>
      <td>${r.hours}</td>
      <td>\u20B9${r.salary}</td>
    `;
    tableBody.appendChild(tr);
  });
}

function renderChart() {
  const ctx = document.getElementById("attendanceChart").getContext("2d");
  const labels = ["01","05","10","15","20","25","30"]; 
  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Present",
        data: [2,3,4,5,4,6,5],
        borderColor: "#6ecbff",
        backgroundColor: "rgba(110,203,255,.15)",
        tension: .35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: "#a9b6ff" }, grid: { color: "rgba(38,51,106,.4)" } },
                y: { ticks: { color: "#a9b6ff", precision: 0 }, grid: { color: "rgba(38,51,106,.4)" } } }
    }
  });
}

chartRange.addEventListener("change", () => {
  chartCustom.style.display = chartRange.value === "custom" ? "flex" : "none";
});
chartApply.addEventListener("click", () => {});
search.addEventListener("input", renderTable);
filterStatus.addEventListener("change", renderTable);
openAdd.addEventListener("click", () => { modalBg.style.display = "flex"; });
closeModal.addEventListener("click", () => { modalBg.style.display = "none"; });
saveAttendance.addEventListener("click", () => { modalBg.style.display = "none"; });

seed();
renderTable();
renderChart();
