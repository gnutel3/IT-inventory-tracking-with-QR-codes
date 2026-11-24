const inventoryAuth = (() => {
  let currentUser = null;
  let onLogin;
  let usersBusy = false;
  const form = document.querySelector("#login-form");
  const status = document.querySelector("#login-status");
  const button = form.querySelector("button");
  const screen = document.querySelector("#login-screen");
  const userForm = document.querySelector("#create-user-form");
  const usersStatus = document.querySelector("#users-status");
  const list = document.querySelector("#users-list");

  async function authorize(session) {
    currentUser = session.user;
    inventoryApi.setCsrf(session.csrf_token);
    const isAdmin = currentUser.role === "admin";
    document.documentElement.classList.toggle("employee-session", !isAdmin);
    document.querySelector("[data-view=import]").hidden = !isAdmin;
    document.querySelector("#users-nav").hidden = !isAdmin;
    const badge = document.querySelector("#signed-in-user");
    badge.textContent = `${currentUser.username} · ${isAdmin ? "Администратор" : "Сотрудник"}`;
    badge.hidden = false;
    document.querySelector("#logout").hidden = false;
    form.elements.password.value = "";
    screen.hidden = true;
    document.documentElement.classList.remove("server-locked");
    await onLogin();
  }

  async function loadUsers() {
    if (usersBusy || currentUser?.role !== "admin") return;
    usersBusy = true;
    list.textContent = "Загрузка…";
    try {
      const users = await inventoryApi.request("auth/users");
      list.replaceChildren();
      for (const user of users) {
        const row = document.createElement("div");
        row.className = "result-item";
        const title = document.createElement("span");
        title.textContent = `${user.username} · ${user.role === "admin" ? "Администратор" : "Сотрудник"} · ${user.active ? "Активен" : "Заблокирован"}`;
        row.append(title);
        if (user.role === "employee") {
          const control = document.createElement("button");
          control.type = "button";
          control.className = "ghost-button";
          control.textContent = user.active ? "Заблокировать" : "Разблокировать";
          control.addEventListener("click", async () => {
            if (!confirm(`${control.textContent} пользователя ${user.username}?`)) return;
            control.disabled = true;
            try {
              await inventoryApi.request(`auth/users/${user.id}/active`, "PUT", { active: !user.active });
              await loadUsers();
            } catch (error) {
              usersStatus.textContent = error.message;
              control.disabled = false;
            }
          });
          row.append(control);
        }
        list.append(row);
      }
    } catch (error) {
      list.textContent = error.message;
    } finally {
      usersBusy = false;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = "Входим…";
    try {
      const session = await inventoryApi.request("auth/login", "POST", {
        username: form.elements.username.value.trim(), password: form.elements.password.value,
      });
      await authorize(session);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector("#logout").addEventListener("click", async (event) => {
    event.target.disabled = true;
    try {
      await inventoryApi.request("auth/logout", "POST");
      location.reload();
    } catch (error) {
      if (error.status === 401) location.reload();
      else {
        document.querySelector("#server-status").textContent = error.message;
        event.target.disabled = false;
      }
    }
  });

  window.addEventListener("inventory-session-expired", () => location.reload());
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && currentUser) location.reload();
  });
  document.querySelector("#refresh-users").addEventListener("click", loadUsers);
  userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = userForm.querySelector("button");
    if (submit.disabled) return;
    submit.disabled = true;
    usersStatus.textContent = "Создание…";
    try {
      await inventoryApi.request("auth/users", "POST", {
        username: userForm.elements.username.value.trim(), password: userForm.elements.password.value,
        role: userForm.elements.role.value,
      });
      userForm.reset();
      usersStatus.textContent = "Пользователь создан.";
      await loadUsers();
    } catch (error) {
      usersStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  return {
    isAdmin: () => currentUser?.role === "admin",
    loadUsers,
    async boot(callback) {
      onLogin = callback;
      screen.hidden = false;
      button.disabled = true;
      try {
        await authorize(await inventoryApi.request("auth/me"));
      } catch (error) {
        status.textContent = error.status === 401 ? "" : error.message;
        form.elements.username.focus();
      } finally {
        button.disabled = false;
      }
    },
  };
})();
