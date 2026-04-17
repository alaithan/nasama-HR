(function () {
  "use strict";

  var CONFIG = {
    apiKey: "AIzaSyAqkLr-uJKIE8uW8zrgqlMpte0KfGPnOBM",
    authDomain: "nasama-hr.firebaseapp.com",
    databaseURL: "https://nasama-hr-default-rtdb.firebaseio.com",
    projectId: "nasama-hr",
    storageBucket: "nasama-hr.firebasestorage.app",
    messagingSenderId: "136664686361",
    appId: "1:136664686361:web:0c5d1fec410f10dfdc6f88",
    measurementId: "G-VH4MMEB0Z0"
  };

  var STORAGE_PREFIX = "nasama_hr_";
  var SESSION_KEY = STORAGE_PREFIX + "session";
  var USERS_KEY = STORAGE_PREFIX + "users";
  var ROOT_PATH = "nasama_hr";
  var DEFAULT_ROLE = "broker";
  var injected = false;
  var busy = false;

  function initFirebase() {
    if (!window.firebase || !window.firebase.apps) {
      throw new Error("Firebase login tools are still loading. Please try again in a moment.");
    }
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(CONFIG);
    }
    return window.firebase;
  }

  function normalizeUsers(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return Object.keys(value)
      .sort(function (a, b) {
        var na = Number(a);
        var nb = Number(b);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a).localeCompare(String(b));
      })
      .map(function (key) {
        return value[key];
      })
      .filter(Boolean);
  }

  function saveUsersCache(users) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (error) {
      console.warn("Could not cache users locally", error);
    }
  }

  function findUserByEmail(users, email) {
    var clean = String(email || "").trim().toLowerCase();
    return users.find(function (user) {
      return String(user.email || "").trim().toLowerCase() === clean;
    });
  }

  function findEmployeeByEmail(employees, email) {
    var clean = String(email || "").trim().toLowerCase();
    if (!clean) return null;
    return employees.find(function (employee) {
      return String(employee.email || "").trim().toLowerCase() === clean;
    }) || null;
  }

  function makeId() {
    return "USR" + Date.now().toString(36).toUpperCase().slice(-6);
  }

  function makePendingUser(googleUser, employee) {
    return {
      id: makeId(),
      name: employee && employee.name ? employee.name : googleUser.displayName || (googleUser.email || "").split("@")[0] || "New User",
      email: googleUser.email || "",
      role: DEFAULT_ROLE,
      empId: employee && employee.id ? employee.id : "",
      active: false,
      passwordHash: "",
      mustChangePw: false,
      authProvider: "google",
      approvalStatus: "pending",
      googleUid: googleUser.uid || "",
      photoURL: googleUser.photoURL || "",
      createdAt: new Date().toISOString(),
      lastLogin: ""
    };
  }

  async function loadUsers(firebase) {
    var snapshot = await firebase.database().ref(ROOT_PATH + "/users").once("value");
    return normalizeUsers(snapshot.val());
  }

  async function loadEmployees(firebase) {
    var snapshot = await firebase.database().ref(ROOT_PATH + "/employees").once("value");
    return normalizeUsers(snapshot.val());
  }

  async function saveUsers(firebase, users) {
    await firebase.database().ref(ROOT_PATH + "/users").set(users);
    saveUsersCache(users);
  }

  async function signInWithGoogle() {
    var firebase = initFirebase();
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    var result = await firebase.auth().signInWithPopup(provider);
    return result.user;
  }

  async function touchLastLogin(firebase, users, user) {
    var nextUsers = users.map(function (item) {
      if (item.id !== user.id) return item;
      return Object.assign({}, item, {
        lastLogin: new Date().toISOString(),
        authProvider: item.authProvider || "google"
      });
    });
    await saveUsers(firebase, nextUsers);
    return nextUsers.find(function (item) {
      return item.id === user.id;
    }) || user;
  }

  async function autoLinkUserToEmployee(firebase, users, user) {
    if (!user || user.empId) return user;
    if (user.role && user.role !== DEFAULT_ROLE) return user;

    var employees = await loadEmployees(firebase);
    var employee = findEmployeeByEmail(employees, user.email);
    if (!employee) return user;

    var nextUsers = users.map(function (item) {
      if (item.id !== user.id) return item;
      return Object.assign({}, item, {
        name: item.name || employee.name,
        role: DEFAULT_ROLE,
        empId: employee.id,
        linkedByEmail: true,
        linkedAt: new Date().toISOString()
      });
    });
    await saveUsers(firebase, nextUsers);
    return nextUsers.find(function (item) {
      return item.id === user.id;
    }) || Object.assign({}, user, { empId: employee.id });
  }

  function loginApprovedUser(user) {
    if (user.role === "broker" && !user.empId) {
      showMessage("Your account is active, but it is not linked to an employee profile yet. Please contact admin.", "warn");
      return;
    }

    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          role: user.role,
          name: user.name,
          userId: user.id,
          empId: user.empId || ""
        })
      );
      localStorage.removeItem("nasama_remember");
    } catch (error) {
      console.warn("Could not save session", error);
    }
    window.location.reload();
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll(".nasama-google-btn").forEach(function (button) {
      button.disabled = value;
    });
  }

  function hasActiveSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw || raw === "null") return false;
      var session = JSON.parse(raw);
      return !!(session && session.userId);
    } catch (error) {
      return false;
    }
  }

  function showMessage(text, type) {
    var msg = document.querySelector(".nasama-auth-msg");
    if (!msg) {
      alert(text);
      return;
    }
    msg.textContent = text;
    msg.className = "nasama-auth-msg show " + (type || "info");
  }

  async function handleGoogleSignIn() {
    if (busy) return;
    setBusy(true);
    showMessage("Opening Google sign-in...", "info");
    try {
      var firebase = initFirebase();
      var googleUser = await signInWithGoogle();
      var users = await loadUsers(firebase);
      var appUser = findUserByEmail(users, googleUser.email);

      if (!appUser) {
        showMessage("This Google account is not registered. Please use Create account first.", "warn");
        await firebase.auth().signOut();
        return;
      }

      if (appUser.active === false) {
        showMessage("Your account is waiting for admin approval. Please try again after admin activates it.", "warn");
        await firebase.auth().signOut();
        return;
      }

      appUser = await autoLinkUserToEmployee(firebase, users, appUser);
      users = await loadUsers(firebase);
      var approvedUser = await touchLastLogin(firebase, users, appUser);
      showMessage("Login approved. Loading HR system...", "success");
      loginApprovedUser(approvedUser);
    } catch (error) {
      console.error("Google sign-in failed", error);
      showMessage(error.message || "Google sign-in failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleRegister() {
    if (busy) return;
    setBusy(true);
    showMessage("Opening Google account registration...", "info");
    try {
      var firebase = initFirebase();
      var googleUser = await signInWithGoogle();
      var users = await loadUsers(firebase);
      var employees = await loadEmployees(firebase);
      var employee = findEmployeeByEmail(employees, googleUser.email);
      var existing = findUserByEmail(users, googleUser.email);

      if (existing) {
        if (!existing.empId && existing.role === DEFAULT_ROLE && employee) {
          await autoLinkUserToEmployee(firebase, users, existing);
        }
        if (existing.active === false) {
          showMessage("Your account already exists and is waiting for admin approval." + (employee ? " It is linked to " + employee.name + "." : ""), "warn");
        } else {
          showMessage("Your account already exists. Please use Sign in with Google.", "info");
        }
        await firebase.auth().signOut();
        return;
      }

      var pendingUser = makePendingUser(googleUser, employee);
      users.push(pendingUser);
      await saveUsers(firebase, users);
      await firebase.auth().signOut();
      showMessage(
        "Account created. It is inactive until admin approves it in User Management." +
          (employee ? " It was linked to employee " + employee.name + " using the email field." : " No employee email matched this Google account yet."),
        "success"
      );
    } catch (error) {
      console.error("Google registration failed", error);
      showMessage(error.message || "Google registration failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  function getUserInfoFromAdminRow(row) {
    var cells = row ? row.querySelectorAll("td") : [];
    if (cells.length < 5) return null;
    var idMatch = (cells[0].textContent || "").match(/USR[A-Z0-9]+/i);
    return {
      id: idMatch ? idMatch[0].toUpperCase() : "",
      email: (cells[1].textContent || "").trim().toLowerCase(),
      status: (cells[4].textContent || "").trim().toLowerCase()
    };
  }

  async function activateUserFromAdminRow(row, button) {
    var info = getUserInfoFromAdminRow(row);
    if (!info || info.status !== "disabled") return;

    try {
      button.disabled = true;
      button.textContent = "...";

      var firebase = initFirebase();
      var users = await loadUsers(firebase);
      var employees = await loadEmployees(firebase);
      var changed = false;
      var nextUsers = users.map(function (user) {
        var sameId = info.id && String(user.id || "").toUpperCase() === info.id;
        var sameEmail = info.email && String(user.email || "").trim().toLowerCase() === info.email;
        if (!sameId && !sameEmail) return user;
        var employee = user.empId ? null : findEmployeeByEmail(employees, user.email);
        changed = true;
        return Object.assign({}, user, {
          active: true,
          approvalStatus: "approved",
          approvedAt: new Date().toISOString(),
          empId: user.empId || (employee && employee.id) || "",
          linkedByEmail: user.linkedByEmail || !!employee,
          linkedAt: user.linkedAt || (employee ? new Date().toISOString() : "")
        });
      });

      if (!changed) {
        throw new Error("Could not find this user in Firebase.");
      }

      await saveUsers(firebase, nextUsers);
      window.location.reload();
    } catch (error) {
      console.error("User activation failed", error);
      alert("Could not activate user: " + error.message);
      button.disabled = false;
      button.textContent = "✅";
    }
  }

  function findSignInButton() {
    return Array.prototype.find.call(document.querySelectorAll("button"), function (button) {
      if (button.closest(".nasama-auth-extra")) return false;
      return (button.textContent || "").trim() === "Sign In";
    });
  }

  function injectButtons() {
    if (injected || hasActiveSession()) return;
    var signInButton = findSignInButton();
    if (!signInButton) return;

    var parent = signInButton.parentElement;
    if (!parent || parent.querySelector(".nasama-auth-extra")) return;

    var wrap = document.createElement("div");
    wrap.className = "nasama-auth-extra";
    var googleIcon =
      '<svg class="nasama-google-icon" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>' +
      '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>' +
      '<path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/>' +
      '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"/>' +
      '</svg>';
    wrap.innerHTML =
      '<div class="nasama-auth-sep">or</div>' +
      '<button type="button" class="nasama-google-btn primary" data-nasama-google="signin">' +
      googleIcon + '<span>Sign in with Google</span>' +
      '</button>' +
      '<button type="button" class="nasama-google-btn" data-nasama-google="register">' +
      googleIcon + '<span>Create account with Google</span>' +
      '</button>' +
      '<div class="nasama-auth-msg" aria-live="polite"></div>';

    signInButton.insertAdjacentElement("afterend", wrap);
    injected = true;
  }

  document.addEventListener("click", function (event) {
    var button = event.target && event.target.closest ? event.target.closest("[data-nasama-google]") : null;
    if (!button) return;
    event.preventDefault();
    if (button.getAttribute("data-nasama-google") === "register") {
      handleGoogleRegister();
    } else {
      handleGoogleSignIn();
    }
  });

  document.addEventListener("click", function (event) {
    var button = event.target && event.target.closest ? event.target.closest("button") : null;
    if (!button || (button.textContent || "").indexOf("✅") === -1) return;
    var row = button.closest("tr");
    var info = getUserInfoFromAdminRow(row);
    if (!info || info.status !== "disabled") return;

    setTimeout(function () {
      activateUserFromAdminRow(row, button);
    }, 120);
  });

  var observer = new MutationObserver(injectButtons);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  var fallbackAttempts = 0;
  var fallbackTimer = setInterval(function () {
    fallbackAttempts += 1;
    injectButtons();
    if (injected || fallbackAttempts >= 40) {
      clearInterval(fallbackTimer);
    }
  }, 250);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButtons);
  } else {
    injectButtons();
  }
})();
