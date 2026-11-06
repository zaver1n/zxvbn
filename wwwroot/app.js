const STORAGE_KEY = "book-house-library";
const state = {
  books: [],
  readers: [],
  totalEverAdded: 0,
  filter: "all",
  sort: "title",
  editingBookId: null,
  editingReaderId: null,
  borrowBookId: null,
  returnBookId: null
};
const coverColors = ["#758c79", "#b68770", "#9d9a74", "#78899a", "#a0808c", "#738f89"];

const elements = {
  booksBody: document.querySelector("#books-body"),
  bookSearch: document.querySelector("#book-search"),
  emptyBooks: document.querySelector("#empty-books"),
  readerList: document.querySelector("#reader-list"),
  emptyReaders: document.querySelector("#empty-readers"),
  toast: document.querySelector("#toast")
};

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === null) {
    state.books = [{
      id: 1,
      title: "Чистый код",
      author: "Роберт Мартин",
      year: 2008,
      isAvailable: true,
      readerId: null,
      borrower: null
    }];
    state.readers = [];
    state.totalEverAdded = 1;
    saveState();
    return;
  }

  const data = JSON.parse(saved);
  if (!Array.isArray(data.books) || !Array.isArray(data.readers) ||
      !Number.isInteger(data.totalEverAdded)) {
    throw new Error("Сохранённые данные библиотеки повреждены. Очистите данные сайта и обновите страницу.");
  }
  state.books = data.books;
  state.readers = data.readers;
  state.totalEverAdded = data.totalEverAdded;
  state.books.forEach(book => {
    book.borrowedAt ??= null;
    book.dueDate ??= null;
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    books: state.books,
    readers: state.readers,
    totalEverAdded: state.totalEverAdded
  }));
}

function nextId(items) {
  return items.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
}

function dateToInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateValue, days) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dateToInputValue(date);
}

function formatDate(dateValue) {
  if (!dateValue) return "Срок не указан";
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "short", year: "numeric"
  }).format(new Date(year, month - 1, day));
}

function daysOverdue(dueDate, today = dateToInputValue(new Date())) {
  if (!dueDate || dueDate >= today) return 0;
  const toUtc = value => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.floor((toUtc(today) - toUtc(dueDate)) / 86400000);
}

function notify(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

function setFormError(formId, message = "") {
  document.querySelector(`#${formId}`).textContent = message;
}

function refresh() {
  renderBooks();
  renderReaders();
  renderStats({
    total: state.books.length,
    available: state.books.filter(book => book.isAvailable).length,
    borrowed: state.books.filter(book => !book.isAvailable).length,
    readers: state.readers.length,
    totalEverAdded: state.totalEverAdded
  });
}

function renderBooks() {
  const query = elements.bookSearch.value.trim().toLocaleLowerCase("ru");
  const filtered = state.books.filter(book => {
    const matchesText = `${book.title} ${book.author} ${book.year}`.toLocaleLowerCase("ru").includes(query);
    const matchesStatus = state.filter === "all" ||
      (state.filter === "available" ? book.isAvailable : !book.isAvailable);
    return matchesText && matchesStatus;
  }).sort((left, right) => state.sort === "year"
    ? left.year - right.year || left.title.localeCompare(right.title, "ru")
    : left.title.localeCompare(right.title, "ru"));

  elements.booksBody.replaceChildren();
  elements.emptyBooks.classList.toggle("hidden", filtered.length > 0);
  filtered.forEach((book, index) => {
    const row = document.createElement("tr");
    const initials = [...book.title.trim()][0]?.toLocaleUpperCase("ru") || "К";
    const overdue = book.isAvailable ? 0 : daysOverdue(book.dueDate);
    const status = book.isAvailable
      ? '<span class="status">Доступна</span>'
      : overdue > 0
        ? `<span class="status overdue">Просрочена на ${overdue} дн.</span>`
        : '<span class="status borrowed">Выдана</span>';
    const borrower = book.borrower
      ? `<span>${escapeText(book.borrower)}</span><small class="due-date">${book.borrowedAt ? `Выдана ${escapeText(formatDate(book.borrowedAt))} · ` : ""}Вернуть до ${escapeText(formatDate(book.dueDate))}</small>`
      : '<span class="muted-cell">—</span>';
    const actions = [
      book.isAvailable
        ? `<button class="action-button" data-action="borrow" data-id="${book.id}">Выдать</button>`
        : `<button class="action-button" data-action="return" data-id="${book.id}">Принять</button>`,
      `<button class="action-button" data-action="edit-book" data-id="${book.id}" aria-label="Редактировать книгу">Изменить</button>`,
      `<button class="action-button danger-action" data-action="delete-book" data-id="${book.id}" aria-label="Удалить книгу">Удалить</button>`
    ].join("");
    row.innerHTML = `
      <td><div class="book-info"><span class="book-cover" style="background:${coverColors[index % coverColors.length]}">${escapeText(initials)}</span><div><strong>${escapeText(book.title)}</strong><small>${escapeText(book.author)}</small></div></div></td>
      <td>${book.year}</td>
      <td>${status}</td>
      <td>${borrower}</td>
      <td><div class="row-actions">${actions}</div></td>`;
    elements.booksBody.append(row);
  });

  document.querySelector("#book-count").textContent = state.books.length;
  document.querySelector("#book-summary").textContent = `Показано ${filtered.length} из ${state.books.length} книг`;
}

function renderReaders() {
  elements.readerList.replaceChildren();
  state.readers.forEach(reader => {
    const fullName = [reader.firstName, reader.lastName].filter(Boolean).join(" ");
    const card = document.createElement("article");
    card.className = "reader-card";
    card.innerHTML = `<span class="reader-avatar">${escapeText([...reader.firstName][0]?.toLocaleUpperCase("ru") || "Ч")}</span><div class="reader-details"><strong>${escapeText(fullName)}</strong><small>${escapeText(reader.phone || "Постоянный читатель")}</small></div><div class="reader-actions"><button class="action-button" data-action="edit-reader" data-id="${reader.id}">Изменить</button><button class="action-button danger-action" data-action="delete-reader" data-id="${reader.id}">Удалить</button></div>`;
    elements.readerList.append(card);
  });
  document.querySelector("#reader-count").textContent = state.readers.length;
  elements.emptyReaders.classList.toggle("hidden", state.readers.length > 0);
}

function renderStats(stats) {
  document.querySelector("#stat-total").textContent = stats.total;
  document.querySelector("#stat-available").textContent = stats.available;
  document.querySelector("#stat-borrowed").textContent = stats.borrowed;
  document.querySelector("#stat-readers").textContent = stats.readers;
  document.querySelector("#total-ever").textContent = stats.totalEverAdded;
  const total = Math.max(stats.total, 1);
  document.querySelector("#available-bar").style.width = `${stats.available / total * 100}%`;
  document.querySelector("#borrowed-bar").style.width = `${stats.borrowed / total * 100}%`;
}

function openDialog(id) {
  document.querySelector(`#${id}`).showModal();
}

function closeDialog(dialog) {
  dialog.close();
}

document.querySelector("#today").textContent = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "long", year: "numeric"
}).format(new Date());
document.querySelector("#year").textContent = new Date().getFullYear();
const yearInput = document.querySelector('input[name="year"]');
yearInput.max = new Date().getFullYear();
yearInput.value = new Date().getFullYear();
yearInput.defaultValue = yearInput.value;

document.querySelector("#open-book-form").addEventListener("click", () => {
  state.editingBookId = null;
  const form = document.querySelector("#book-form");
  form.reset();
  yearInput.value = new Date().getFullYear();
  document.querySelector("#book-modal-title").textContent = "Новая книга";
  document.querySelector("#book-submit").textContent = "Добавить книгу";
  setFormError("book-error");
  openDialog("book-modal");
});
document.querySelector("#open-reader-form").addEventListener("click", () => {
  state.editingReaderId = null;
  document.querySelector("#reader-form").reset();
  document.querySelector("#reader-modal-title").textContent = "Новый читатель";
  document.querySelector("#reader-submit").textContent = "Зарегистрировать";
  setFormError("reader-error");
  openDialog("reader-modal");
});
document.querySelectorAll("[data-close]").forEach(button => {
  button.addEventListener("click", () => closeDialog(button.closest("dialog")));
});
document.querySelectorAll("dialog").forEach(dialog => {
  dialog.addEventListener("click", event => {
    if (event.target === dialog) closeDialog(dialog);
  });
});

document.querySelector("#book-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  try {
    const title = String(values.get("title")).trim();
    const author = String(values.get("author")).trim();
    const year = Number(values.get("year"));
    if (!title || !author || !Number.isInteger(year) || year < 1 || year > new Date().getFullYear()) {
      throw new Error("Проверьте название, автора и год издания.");
    }

    if (state.editingBookId !== null) {
      const book = state.books.find(item => item.id === state.editingBookId);
      if (!book) throw new Error("Книга не найдена.");
      book.title = title;
      book.author = author;
      book.year = year;
    } else {
      state.books.push({
        id: nextId(state.books),
        title,
        author,
        year,
        isAvailable: true,
        readerId: null,
        borrower: null,
        borrowedAt: null,
        dueDate: null
      });
      state.totalEverAdded++;
    }
    saveState();
    form.reset();
    closeDialog(document.querySelector("#book-modal"));
    refresh();
    notify(state.editingBookId === null ? "Книга добавлена в коллекцию." : "Данные книги обновлены.");
    state.editingBookId = null;
  } catch (error) {
    setFormError("book-error", error.message);
  }
});

document.querySelector("#reader-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  try {
    const firstName = String(values.get("firstName")).trim();
    const lastName = String(values.get("lastName")).trim();
    const phone = String(values.get("phone")).trim();
    if (!firstName) throw new Error("Укажите имя читателя.");
    const duplicate = state.readers.some(reader => reader.id !== state.editingReaderId &&
      reader.firstName.toLocaleLowerCase("ru") === firstName.toLocaleLowerCase("ru") &&
      reader.lastName.toLocaleLowerCase("ru") === lastName.toLocaleLowerCase("ru"));
    if (duplicate) throw new Error("Такой читатель уже зарегистрирован.");

    if (state.editingReaderId !== null) {
      const reader = state.readers.find(item => item.id === state.editingReaderId);
      if (!reader) throw new Error("Читатель не найден.");
      reader.firstName = firstName;
      reader.lastName = lastName;
      reader.phone = phone;
      state.books.filter(book => !book.isAvailable && book.readerId === reader.id)
        .forEach(book => { book.borrower = [firstName, lastName].filter(Boolean).join(" "); });
    } else {
      state.readers.push({ id: nextId(state.readers), firstName, lastName, phone });
    }
    saveState();
    form.reset();
    closeDialog(document.querySelector("#reader-modal"));
    refresh();
    notify(state.editingReaderId === null ? "Читатель зарегистрирован." : "Данные читателя обновлены.");
    state.editingReaderId = null;
  } catch (error) {
    setFormError("reader-error", error.message);
  }
});

document.querySelector("#borrow-form").addEventListener("submit", event => {
  event.preventDefault();
  const readerId = Number(new FormData(event.currentTarget).get("readerId"));
  try {
    const book = state.books.find(item => item.id === state.borrowBookId);
    const reader = state.readers.find(item => item.id === readerId);
    const dueDate = String(new FormData(event.currentTarget).get("dueDate"));
    if (!book || !book.isAvailable) throw new Error("Книга уже выдана или не найдена.");
    if (!reader) throw new Error("Читатель не найден.");
    if (!dueDate || dueDate < dateToInputValue(new Date())) throw new Error("Укажите сегодняшний или будущий срок возврата.");
    book.isAvailable = false;
    book.readerId = reader.id;
    book.borrower = [reader.firstName, reader.lastName].filter(Boolean).join(" ");
    book.borrowedAt = dateToInputValue(new Date());
    book.dueDate = dueDate;
    saveState();
    closeDialog(document.querySelector("#borrow-modal"));
    refresh();
    notify("Книга выдана читателю.");
  } catch (error) {
    setFormError("borrow-error", error.message);
  }
});

document.querySelector("#return-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const book = state.books.find(item => item.id === state.returnBookId);
    if (!book || book.isAvailable) throw new Error("Книга уже находится в библиотеке или не найдена.");
    const overdueDays = daysOverdue(book.dueDate);
    book.isAvailable = true;
    book.readerId = null;
    book.borrower = null;
    book.borrowedAt = null;
    book.dueDate = null;
    saveState();
    closeDialog(document.querySelector("#return-modal"));
    refresh();
    notify(`Книга возвращена. Штраф: ${overdueDays * 100} ₸.`);
  } catch (error) {
    setFormError("return-error", error.message);
  }
});

elements.booksBody.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button || !["borrow", "return"].includes(button.dataset.action)) return;
  const book = state.books.find(item => item.id === Number(button.dataset.id));
  if (!book) return;
  if (button.dataset.action === "borrow") {
    if (state.readers.length === 0) {
      notify("Сначала зарегистрируйте читателя.");
      return;
    }
    state.borrowBookId = book.id;
    document.querySelector("#borrow-book-title").textContent = `«${book.title}»`;
    const today = dateToInputValue(new Date());
    const dueDateInput = document.querySelector("#due-date-input");
    dueDateInput.min = today;
    dueDateInput.value = addDays(today, 14);
    const select = document.querySelector("#reader-select");
    select.replaceChildren(...state.readers.map(reader => {
      const option = document.createElement("option");
      option.value = reader.id;
      option.textContent = [reader.firstName, reader.lastName].filter(Boolean).join(" ");
      return option;
    }));
    setFormError("borrow-error");
    openDialog("borrow-modal");
  } else {
    state.returnBookId = book.id;
    document.querySelector("#return-book-title").textContent = `«${book.title}»`;
    const overdue = daysOverdue(book.dueDate);
    const issuedText = book.borrowedAt ? `Выдана: ${formatDate(book.borrowedAt)}. ` : "";
    document.querySelector("#return-details").textContent = book.dueDate
      ? `${issuedText}Срок возврата: ${formatDate(book.dueDate)}.${overdue > 0 ? ` Просрочка: ${overdue} дн., штраф: ${overdue * 100} ₸.` : " Просрочки нет."}`
      : `${issuedText}Для этой выдачи срок возврата не был установлен.`;
    document.querySelector("#return-form").reset();
    setFormError("return-error");
    openDialog("return-modal");
  }
});

elements.booksBody.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const book = state.books.find(item => item.id === Number(button.dataset.id));
  if (!book) return;
  if (button.dataset.action === "edit-book") {
    state.editingBookId = book.id;
    const form = document.querySelector("#book-form");
    form.elements.title.value = book.title;
    form.elements.author.value = book.author;
    form.elements.year.value = book.year;
    document.querySelector("#book-modal-title").textContent = "Редактировать книгу";
    document.querySelector("#book-submit").textContent = "Сохранить";
    setFormError("book-error");
    openDialog("book-modal");
  } else if (button.dataset.action === "delete-book") {
    if (!window.confirm(`Удалить книгу «${book.title}»?`)) return;
    state.books = state.books.filter(item => item.id !== book.id);
    saveState();
    refresh();
    notify("Книга удалена.");
  }
});

elements.readerList.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const reader = state.readers.find(item => item.id === Number(button.dataset.id));
  if (!reader) return;
  if (button.dataset.action === "edit-reader") {
    state.editingReaderId = reader.id;
    const form = document.querySelector("#reader-form");
    form.elements.firstName.value = reader.firstName;
    form.elements.lastName.value = reader.lastName;
    form.elements.phone.value = reader.phone;
    document.querySelector("#reader-modal-title").textContent = "Редактировать читателя";
    document.querySelector("#reader-submit").textContent = "Сохранить";
    setFormError("reader-error");
    openDialog("reader-modal");
  } else if (button.dataset.action === "delete-reader") {
    const hasBorrowedBooks = state.books.some(book => !book.isAvailable && book.readerId === reader.id);
    if (hasBorrowedBooks) {
      notify("Нельзя удалить читателя, пока у него есть выданные книги.");
      return;
    }
    if (!window.confirm(`Удалить читателя «${[reader.firstName, reader.lastName].filter(Boolean).join(" ")}»?`)) return;
    state.readers = state.readers.filter(item => item.id !== reader.id);
    saveState();
    refresh();
    notify("Читатель удалён.");
  }
});

elements.bookSearch.addEventListener("input", renderBooks);
document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelector(".filter.active").classList.remove("active");
    button.classList.add("active");
    state.filter = button.dataset.filter;
    renderBooks();
  });
});
document.querySelector("#book-sort").addEventListener("change", event => {
  state.sort = event.currentTarget.value;
  renderBooks();
});
document.querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelector(".nav-link.active").classList.remove("active");
    link.classList.add("active");
  });
});
document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    elements.bookSearch.focus();
  }
});

try {
  loadState();
  refresh();
} catch (error) {
  elements.booksBody.replaceChildren();
  elements.emptyBooks.classList.remove("hidden");
  elements.emptyBooks.innerHTML = `<strong>Не удалось загрузить библиотеку</strong><p>${escapeText(error.message)}</p>`;
  document.querySelector("#book-summary").textContent = "Проверьте настройки хранения данных браузера";
}
