const STORAGE_KEY = "petal-ledger-v1";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const els = {
  monthLabel: document.getElementById("month-label"),
  prev: document.getElementById("prev-month"),
  next: document.getElementById("next-month"),
  currency: document.getElementById("currency"),
  remainingLabel: document.getElementById("remaining-label"),
  remaining: document.getElementById("remaining"),
  whisper: document.getElementById("budget-whisper"),
  meter: document.getElementById("meter"),
  meterFill: document.getElementById("meter-fill"),
  meterCaption: document.getElementById("meter-caption"),
  budgetForm: document.getElementById("budget-form"),
  budgetInput: document.getElementById("budget-input"),
  statSpent: document.getElementById("stat-spent"),
  statBudget: document.getElementById("stat-budget"),
  statCount: document.getElementById("stat-count"),
  expenseForm: document.getElementById("expense-form"),
  amount: document.getElementById("amount"),
  note: document.getElementById("note"),
  date: document.getElementById("date"),
  chart: document.getElementById("chart"),
  peak: document.getElementById("peak-note"),
  dayFilter: document.getElementById("day-filter"),
  dayFilterLabel: document.getElementById("day-filter-label"),
  clearDay: document.getElementById("clear-day"),
  listTitle: document.getElementById("list-title"),
  expenses: document.getElementById("expenses"),
  toast: document.getElementById("toast"),
};

const state = load();
let undo = null;
let toastTimer = null;

function todayKey() {
  const now = new Date();
  return monthKey(now.getFullYear(), now.getMonth());
}

function monthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function parseMonth(key) {
  const [year, month] = key.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function load() {
  const fresh = {
    currency: "₹",
    budgets: {},
    expenses: [],
    view: todayKey(),
    selectedDay: null,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const saved = JSON.parse(raw);
    return {
      ...fresh,
      ...saved,
      budgets: saved.budgets || {},
      expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
      selectedDay: null,
    };
  } catch {
    return fresh;
  }
}

function save() {
  const { selectedDay, ...persisted } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

function money(amount) {
  const formatted = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? "−" : ""}${state.currency}${formatted}`;
}

function monthExpenses() {
  return state.expenses
    .filter((item) => item.date.startsWith(state.view))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
}

function spentTotal(items) {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

function defaultDate() {
  const { year, monthIndex } = parseMonth(state.view);
  const now = new Date();
  if (state.view === todayKey()) {
    return toInputDate(now);
  }
  return toInputDate(new Date(year, monthIndex, 1));
}

function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function prettyDate(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function render() {
  const { year, monthIndex } = parseMonth(state.view);
  const items = monthExpenses();
  const spent = round2(spentTotal(items));
  const budget = state.budgets[state.view];
  const hasBudget = typeof budget === "number" && budget >= 0;

  els.monthLabel.textContent = `${MONTHS[monthIndex]} ${year}`;
  els.currency.value = state.currency;
  els.budgetInput.value = hasBudget ? String(budget) : "";
  if (!els.date.value || !els.date.value.startsWith(state.view)) {
    els.date.value = defaultDate();
  }

  els.statSpent.textContent = money(spent);
  els.statBudget.textContent = hasBudget ? money(budget) : "—";
  els.statCount.textContent = String(items.length);

  if (!hasBudget) {
    els.remainingLabel.textContent = "No budget yet";
    els.remaining.textContent = "—";
    els.remaining.classList.remove("over");
    els.whisper.textContent = "Set a number you feel good about. Spends will come off it.";
    els.meter.hidden = true;
    els.meterCaption.textContent = "";
  } else {
    const left = round2(budget - spent);
    const ratio = budget === 0 ? (spent > 0 ? 1 : 0) : Math.min(spent / budget, 1);
    els.meter.hidden = false;
    els.meterFill.style.width = `${Math.round(ratio * 100)}%`;
    if (left < 0) {
      els.remainingLabel.textContent = "Over budget";
      els.remaining.textContent = money(left);
      els.remaining.classList.add("over");
      els.whisper.textContent = "A little past the line. You can still steer the rest of the month.";
      els.meterCaption.textContent = `${money(spent)} spent of ${money(budget)}`;
    } else {
      els.remainingLabel.textContent = "Left to spend";
      els.remaining.textContent = money(left);
      els.remaining.classList.remove("over");
      els.whisper.textContent =
        budget === 0 ? "Budget is zero, so every spend shows as over." : "Each new spend comes straight off this.";
      const pct = budget === 0 ? 0 : Math.round((spent / budget) * 100);
      els.meterCaption.textContent = `${pct}% used · ${money(spent)} of ${money(budget)}`;
    }
  }

  renderChart(items, year, monthIndex);
  renderList(items);
  save();
}

function renderChart(items, year, monthIndex) {
  const count = daysInMonth(year, monthIndex);
  const totals = Array.from({ length: count }, () => 0);
  items.forEach((item) => {
    const day = Number(item.date.slice(8, 10));
    totals[day - 1] += item.amount;
  });
  const max = Math.max(...totals, 0);
  els.chart.style.gridTemplateColumns = `repeat(${count}, minmax(0, 1fr))`;
  els.chart.replaceChildren();
  els.chart.setAttribute(
    "aria-label",
    `Daily spending for ${MONTHS[monthIndex]} ${year}. Highest day is ${max ? money(max) : "nothing yet"}.`
  );

  totals.forEach((total, index) => {
    const day = index + 1;
    const col = document.createElement("button");
    col.type = "button";
    col.className = "bar-col";
    if (state.selectedDay === day) col.classList.add("is-selected");
    const height = max === 0 ? 4 : Math.max(8, Math.round((total / max) * 156));
    const label = total
      ? `${MONTHS[monthIndex]} ${day}: ${money(round2(total))}`
      : `${MONTHS[monthIndex]} ${day}: nothing spent`;
    col.title = label;
    col.setAttribute("aria-label", label);
    col.innerHTML = `
      <span class="bar-track">
        <span class="bar${total === 0 ? " is-empty" : ""}${total > 0 && total === max ? " is-peak" : ""}" style="height:${total === 0 ? 4 : height}px"></span>
      </span>
      <span>${day}</span>
    `;
    col.addEventListener("click", () => {
      state.selectedDay = state.selectedDay === day ? null : day;
      render();
    });
    els.chart.appendChild(col);
  });

  if (max === 0) {
    els.peak.textContent = "Your month is a quiet page.";
  } else {
    const peakDay = totals.indexOf(max) + 1;
    els.peak.textContent = `Fullest day: ${MONTHS[monthIndex].slice(0, 3)} ${peakDay} · ${money(round2(max))}`;
  }
}

function renderList(items) {
  const filtered =
    state.selectedDay == null
      ? items
      : items.filter((item) => Number(item.date.slice(8, 10)) === state.selectedDay);

  if (state.selectedDay == null) {
    els.dayFilter.hidden = true;
    els.listTitle.textContent = "This month";
  } else {
    els.dayFilter.hidden = false;
    const { year, monthIndex } = parseMonth(state.view);
    const label = `${MONTHS[monthIndex]} ${state.selectedDay}`;
    els.dayFilterLabel.textContent = label;
    els.listTitle.textContent = label;
  }

  els.expenses.replaceChildren();
  if (filtered.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.innerHTML =
      state.selectedDay == null
        ? "<strong>Nothing kept yet</strong><span>Record a spend and it will land here, and on the graph.</span>"
        : "<strong>A quiet day</strong><span>No spends on this date.</span>";
    els.expenses.appendChild(empty);
    return;
  }

  filtered.forEach((item) => {
    const row = document.createElement("li");
    row.className = "expense";
    const time = document.createElement("time");
    time.dateTime = item.date;
    time.textContent = prettyDate(item.date);
    const copy = document.createElement("div");
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = item.note || "Spend";
    const kind = document.createElement("div");
    kind.className = "kind";
    kind.textContent = item.category;
    copy.append(note, kind);
    const sum = document.createElement("div");
    sum.className = "sum";
    sum.textContent = money(item.amount);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-btn";
    remove.setAttribute("aria-label", `Delete ${item.note || "spend"} of ${money(item.amount)}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => removeExpense(item.id));
    row.append(time, copy, sum, remove);
    els.expenses.appendChild(row);
  });
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message, actionLabel, onAction) {
  clearTimeout(toastTimer);
  els.toast.replaceChildren();
  const text = document.createElement("span");
  text.textContent = message;
  els.toast.appendChild(text);
  if (actionLabel) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = actionLabel;
    button.addEventListener("click", () => {
      hideToast();
      onAction();
    });
    els.toast.appendChild(button);
  }
  els.toast.hidden = false;
  toastTimer = setTimeout(hideToast, 4200);
}

function hideToast() {
  els.toast.hidden = true;
  clearTimeout(toastTimer);
}

function removeExpense(id) {
  const index = state.expenses.findIndex((item) => item.id === id);
  if (index === -1) return;
  const [removed] = state.expenses.splice(index, 1);
  undo = { item: removed, index };
  render();
  showToast("Spend removed. Your budget is whole again.", "Undo", () => {
    if (!undo) return;
    state.expenses.splice(undo.index, 0, undo.item);
    undo = null;
    render();
  });
}

els.prev.addEventListener("click", () => shiftMonth(-1));
els.next.addEventListener("click", () => shiftMonth(1));

function shiftMonth(delta) {
  const { year, monthIndex } = parseMonth(state.view);
  const next = new Date(year, monthIndex + delta, 1);
  state.view = monthKey(next.getFullYear(), next.getMonth());
  state.selectedDay = null;
  els.date.value = defaultDate();
  render();
}

els.currency.addEventListener("change", () => {
  state.currency = els.currency.value;
  render();
});

els.budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = round2(Number(els.budgetInput.value));
  if (!Number.isFinite(value) || value < 0) return;
  state.budgets[state.view] = value;
  render();
  showToast("Budget saved for this month.");
});

els.expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = round2(Number(els.amount.value));
  const date = els.date.value;
  if (!Number.isFinite(amount) || amount <= 0 || !date) return;
  const category = new FormData(els.expenseForm).get("category") || "Other";
  state.expenses.push({
    id: uid(),
    amount,
    note: els.note.value.trim(),
    date,
    category: String(category),
  });
  if (!date.startsWith(state.view)) {
    state.view = date.slice(0, 7);
    state.selectedDay = null;
  }
  els.amount.value = "";
  els.note.value = "";
  render();
  els.amount.focus();
});

els.clearDay.addEventListener("click", () => {
  state.selectedDay = null;
  render();
});

render();
