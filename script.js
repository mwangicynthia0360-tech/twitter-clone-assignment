
const API = "https://jsonplaceholder.typicode.com";


const OPENROUTER_KEY = "";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openrouter/free";


const AVATAR = {
  key: "",
  host: "",
 
  url: (user) => "",
};


const state = {
  users: [],
  posts: [],
  comments: {},            // commentsByPostId
  liked: new Set(),
  retweeted: new Set(),
  following: new Set(),
  openComments: new Set(), // posts whose comments are expanded
  avatars: {},             // userId -> image URL
  me: 1,                   // the "logged-in" user
  view: "home",
  profileId: 1,
  history: [],             // chat history sent to the AI each time
};

const $ = (id) => document.getElementById(id);

// Escape text so API data can never inject HTML.
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const userOf = (id) => state.users.find((u) => u.id === id);


async function getJSON(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`Request failed (${res.status}) for ${path}`);
  return res.json();
}

async function init() {
  $("status").innerHTML = '<div class="spinner"></div>Loading feed...';
  try {
    // Users, posts and comments are fetched in parallel, once each.
    const [users, posts, comments] = await Promise.all([
      getJSON("/users"), getJSON("/posts"), getJSON("/comments"),
    ]);
    state.users = users;
    state.posts = posts;
    // Group comments by postId so each post can look up its own list.
    state.comments = comments.reduce((acc, c) => {
      (acc[c.postId] = acc[c.postId] || []).push(c);
      return acc;
    }, {});
    $("status").innerHTML = "";
    render();
    loadAvatars(); // optional, runs after the first paint
  } catch (err) {
    $("status").innerHTML = `<div class="error">Could not load data. ${esc(err.message)}. Check your connection and reload.</div>`;
  }
}


async function loadAvatars() {
  if (!AVATAR.key) return; // no key: initials only
  await Promise.allSettled(state.users.map(async (u) => {
    const res = await fetch(AVATAR.url(u), {
      headers: { "X-RapidAPI-Key": AVATAR.key, "X-RapidAPI-Host": AVATAR.host },
    });
    if (!res.ok) throw new Error("avatar limit or error"); // limit exceeded -> fallback
    state.avatars[u.id] = URL.createObjectURL(await res.blob());
  }));
  render();
}

function avatar(user, size = "") {
  const img = state.avatars[user.id];
  if (img) return `<img class="avatar ${size}" src="${img}" alt="${esc(user.name)}">`;
  const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  const color = user.id % 2 ? "navy" : "orange";
  return `<div class="avatar ${color} ${size}">${esc(initials)}</div>`;
}


const baseLikes = (p) => (p.id * 7) % 23;
const baseRetweets = (p) => (p.id * 3) % 11;

function postHTML(p) {
  const u = userOf(p.userId);
  const cs = state.comments[p.id] || [];
  const likes = baseLikes(p) + (state.liked.has(p.id) ? 1 : 0);
  const rts = baseRetweets(p) + (state.retweeted.has(p.id) ? 1 : 0);
  const open = state.openComments.has(p.id);
  return `
  <article class="post" data-id="${p.id}">
    <div class="clickable" data-action="profile" data-user="${u.id}">${avatar(u)}</div>
    <div class="post-body">
      <div>
        <span class="name clickable" data-action="profile" data-user="${u.id}">${esc(u.name)}</span>
        <span class="handle">@${esc(u.username)}</span>
      </div>
      ${p.title ? `<p class="title">${esc(p.title)}</p>` : ""}
      <p>${esc(p.body)}</p>
      <div class="actions">
        <button data-action="comments">Comments (${cs.length})</button>
        <button data-action="like" class="${state.liked.has(p.id) ? "on" : ""}">Like ${likes}</button>
        <button data-action="retweet" class="${state.retweeted.has(p.id) ? "on" : ""}">Retweet ${rts}</button>
        <button data-action="summarize">Summarize with AI</button>
      </div>
      ${open ? `<div class="comments">${cs.length ? cs.map((c) =>
        `<div class="comment"><small>${esc(c.name)} (${esc(c.email)})</small>${esc(c.body)}</div>`).join("") : "<small>No replies yet.</small>"}</div>` : ""}
    </div>
  </article>`;
}

function renderSuggestions() {
  $("suggestions").innerHTML = state.users.filter((u) => u.id !== state.me).slice(0, 3).map((u) => `
    <div class="suggest">
      <div class="clickable" data-action="profile" data-user="${u.id}">${avatar(u, "sm")}</div>
      <div><div class="name clickable" data-action="profile" data-user="${u.id}">${esc(u.name)}</div>
      <span class="handle" style="margin:0">@${esc(u.username)}</span></div>
    </div>`).join("");
}

const BIOS = [
  "Coffee first, code second. Building small things with JavaScript.",
  "Reads the docs so you do not have to.",
  "Designer by day, tinkerer by night.",
  "Shipping features and fixing last week's bugs.",
];

function renderProfile() {
  const u = userOf(state.profileId);
  const mine = state.posts.filter((p) => p.userId === u.id);
  const f = state.following.has(u.id);
  const followers = 800 + u.id * 137 + (f ? 1 : 0);
  $("profile-view").innerHTML = `
    <div class="cover"></div>
    <div class="profile-head">
      <div class="profile-top">
        ${avatar(u, "xl")}
        ${u.id === state.me ? "" : `<button class="btn outline ${f ? "on" : ""}" data-action="follow">${f ? "Following" : "Follow"}</button>`}
      </div>
      <h2>${esc(u.name)}</h2>
      <span class="handle" style="margin:0">@${esc(u.username)}</span>
      <p style="margin-top:8px">${esc(BIOS[u.id % BIOS.length])}</p>
      <div class="meta">
        <span>Works at ${esc(u.company.name)}</span><span>${esc(u.address.city)}</span>
        <span>${esc(u.website)}</span><span>${esc(u.email)}</span>
      </div>
      <div class="stats"><span><b>${100 + u.id * 23}</b> Following</span>
        <span><b>${followers.toLocaleString()}</b> Followers</span><span><b>${mine.length}</b> Posts</span></div>
    </div>
    <h3 class="page-title">Posts by ${esc(u.name.split(" ")[0])}</h3>
    ${mine.map(postHTML).join("")}`;
}

function render() {
  $("compose-avatar").innerHTML = avatar(userOf(state.me));
  $("home-view").hidden = state.view !== "home";
  $("profile-view").hidden = state.view !== "profile";
  document.querySelectorAll(".nav-btn[data-view]").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === state.view));
  if (state.view === "home") $("feed").innerHTML = state.posts.map(postHTML).join("");
  else renderProfile();
  renderSuggestions();
}


$("tweet-input").addEventListener("input", () => {
  const left = 280 - $("tweet-input").value.length;
  $("characters").textContent = left;
  $("characters").classList.toggle("warn", left <= 20);
  $("tweet-btn").disabled = left < 0 || $("tweet-input").value.trim() === "";
});

$("tweet-btn").addEventListener("click", () => {
  const text = $("tweet-input").value.trim();
  if (!text) return;
  // Local tweets get ids above 1000 so they never clash with API posts.
  state.posts.unshift({ id: 1000 + state.posts.length, userId: state.me, title: "", body: text });
  $("tweet-input").value = "";
  $("tweet-input").dispatchEvent(new Event("input"));
  render();
});


document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const postEl = el.closest(".post");
  const pid = postEl ? Number(postEl.dataset.id) : null;
  const toggle = (set, id) => (set.has(id) ? set.delete(id) : set.add(id));

  switch (el.dataset.action) {
    case "nav":
      state.view = el.dataset.view;
      state.profileId = state.me; // Profile tab shows the logged-in user
      render(); break;
    case "profile":
      state.view = "profile"; state.profileId = Number(el.dataset.user);
      render(); window.scrollTo(0, 0); break;
    case "comments": toggle(state.openComments, pid); render(); break;
    case "like": toggle(state.liked, pid); render(); break;
    case "retweet": toggle(state.retweeted, pid); render(); break;
    case "follow": toggle(state.following, state.profileId); render(); break;
    case "summarize": summarizePost(pid); break;
    case "open-chat": $("chat-panel").hidden = false; $("chat-text").focus(); break;
    case "close-chat": $("chat-panel").hidden = true; break;
  }
});


function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  $("chat-log").appendChild(div);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;
  return div;
}

async function askAI(userText) {
  $("chat-panel").hidden = false;
  addMsg("user", userText);
  state.history.push({ role: "user", content: userText }); // memory for context
  const thinking = addMsg("ai thinking", "Thinking...");
  $("chat-send").disabled = true;
  try {
    if (!OPENROUTER_KEY) throw new Error("Add your OpenRouter key to OPENROUTER_KEY in app.js.");
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENROUTER_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: state.history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `Request failed (${res.status})`);
    const reply = data.choices[0].message.content;
    state.history.push({ role: "assistant", content: reply });
    thinking.className = "msg ai";
    thinking.textContent = reply;
  } catch (err) {
    state.history.pop(); // keep history consistent after a failed turn
    thinking.className = "msg ai";
    thinking.innerHTML = `<span class="error">${esc(err.message)}</span>`;
  } finally {
    $("chat-send").disabled = false;
  }
}

function summarizePost(id) {
  const p = state.posts.find((x) => x.id === id);
  const cs = (state.comments[id] || []).map((c) => `- ${c.body}`).join("\n");
  askAI(`Summarize this post in two sentences, then say what the commenters think.\n\nPost: ${p.title} ${p.body}\n\nComments:\n${cs || "None"}`);
}

function sendChat() {
  const text = $("chat-text").value.trim();
  if (!text) return;
  $("chat-text").value = "";
  askAI(text);
}
$("chat-send").addEventListener("click", sendChat);
$("chat-text").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

init()