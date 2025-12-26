import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, where, doc, updateDoc, increment, deleteDoc, setDoc, getDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLlmycGb6CfHNO6A2E57vNwX2j2pCubME",
  authDomain: "studyswap-26f7f.firebaseapp.com",
  projectId: "studyswap-26f7f",
  storageBucket: "studyswap-26f7f.firebasestorage.app",
  messagingSenderId: "628833347286",
  appId: "1:628833347286:web:ba140afdb7f90c9a1ccb77",
  measurementId: "G-306GF65RN2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const NO_PFP = "https://www.pngitem.com/pimgs/m/146-1468479_my-profile-icon-blank-profile-picture-circle-hd.png";
let currentUser = null, currentSubject = "All", currentGrade = "All", activePostId = "", userData = {};

onAuthStateChanged(auth, async (user) => {
    const loginBtn = document.getElementById('btn-login');
    if (loginBtn) loginBtn.onclick = () => signInWithPopup(auth, provider);

    if (user) {
        currentUser = user;
        const userRef = doc(db, "users", user.uid);
        onSnapshot(userRef, (snap) => {
            userData = snap.data() || { savedPosts: [] };
            updateUI(user);
        });
        if (!(await getDoc(userRef)).exists()) {
            await setDoc(userRef, { name: user.displayName, photoURL: user.photoURL || NO_PFP, savedPosts: [] });
        }
        changeTab('home');
        applyFilters();
        initLiveStatus();
    } else {
        document.getElementById('screen-login').classList.remove('hidden');
        document.getElementById('nav-bar').classList.add('hidden');
        document.getElementById('user-info').classList.add('hidden');
    }
});

function updateUI(user) {
    document.getElementById('screen-login').classList.add('hidden');
    document.getElementById('nav-bar').classList.remove('hidden');
    document.getElementById('user-info').classList.remove('hidden');
    document.getElementById('my-avatar').src = user.photoURL || NO_PFP;
    document.getElementById('profile-img').src = user.photoURL || NO_PFP;
    document.getElementById('profile-name').innerText = user.displayName;
}

function applyFilters() {
    let constraints = [orderBy("createdAt", "desc")];
    if (currentSubject !== "All") constraints.push(where("tag", "==", currentSubject));
    if (currentGrade !== "All") constraints.push(where("grade", "==", currentGrade));

    onSnapshot(query(collection(db, "posts"), ...constraints), (snap) => {
        const feed = document.getElementById('feed-list');
        feed.innerHTML = '';
        snap.forEach(docSnap => {
            feed.innerHTML += renderPost(docSnap.id, docSnap.data());
            loadReplies(docSnap.id);
        });
    });
}

function renderPost(id, d) {
    const isLiked = d.likedBy?.includes(currentUser.uid);
    const isSaved = userData.savedPosts?.includes(id);
    return `
        <div class="post-card ${d.isTutorRequest ? 'priority-card' : ''}">
            ${d.isTutorRequest ? '<div class="tutor-badge"><ion-icon name="alert-circle"></ion-icon> TUTOR REQUESTED</div>' : ''}
            ${d.uid === currentUser.uid ? `<ion-icon name="trash-outline" class="delete-btn" onclick="deletePost('${id}')"></ion-icon>` : ''}
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <img src="${d.userPhoto || NO_PFP}" class="circle-pfp">
                <div><b>${d.userName}</b><br><span style="font-size:11px; color:#aaa;">${d.grade} • ${d.tag}</span></div>
            </div>
            <p style="margin:0 0 15px 0;">${d.text}</p>
            <div class="post-actions">
                <div class="action-item" onclick='toggleLike("${id}", ${JSON.stringify(d.likedBy || [])})'>
                    <ion-icon name="${isLiked ? 'heart' : 'heart-outline'}" style="color:${isLiked ? '#ff4757' : '#666'}"></ion-icon> ${d.likes || 0}
                </div>
                <div class="action-item" onclick="openReplyModal('${id}')"><ion-icon name="chatbubble-outline"></ion-icon> Reply</div>
                <ion-icon name="${isSaved ? 'bookmark' : 'bookmark-outline'}" class="bookmark-btn ${isSaved ? 'saved' : ''}" onclick="toggleSave('${id}')"></ion-icon>
            </div>
            <div id="replies-${id}"></div>
        </div>`;
}

window.toggleLike = async (id, likedBy) => {
    const ref = doc(db, "posts", id);
    likedBy.includes(currentUser.uid) ? await updateDoc(ref, { likedBy: arrayRemove(currentUser.uid), likes: increment(-1) }) : await updateDoc(ref, { likedBy: arrayUnion(currentUser.uid), likes: increment(1) });
};

window.toggleSave = async (id) => {
    const ref = doc(db, "users", currentUser.uid);
    userData.savedPosts?.includes(id) ? await updateDoc(ref, { savedPosts: arrayRemove(id) }) : await updateDoc(ref, { savedPosts: arrayUnion(id) });
};

window.deletePost = async (id) => { if(confirm("Delete?")) await deleteDoc(doc(db, "posts", id)); };

document.getElementById('submitPost').onclick = async () => {
    const text = document.getElementById('postText').value;
    if(!text) return;
    await addDoc(collection(db, "posts"), {
        text, tag: document.getElementById('postTag').value, grade: document.getElementById('postGrade').value,
        isTutorRequest: document.getElementById('tutorRequest').checked,
        uid: currentUser.uid, userName: currentUser.displayName, userPhoto: currentUser.photoURL || NO_PFP,
        likes: 0, likedBy: [], createdAt: serverTimestamp()
    });
    closeModal();
    document.getElementById('postText').value = "";
};

window.switchProfileView = (view) => {
    document.querySelectorAll('.p-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + view).classList.add('active');
    const feed = document.getElementById('profile-feed');
    feed.innerHTML = '';
    let q;
    if (view === 'my') {
        q = query(collection(db, "posts"), where("uid", "==", currentUser.uid));
    } else {
        if (!userData.savedPosts || userData.savedPosts.length === 0) {
            feed.innerHTML = '<p style="text-align:center; padding:20px; color:#aaa;">No saved posts.</p>';
            return;
        }
        q = query(collection(db, "posts"), where("__name__", "in", userData.savedPosts));
    }
    onSnapshot(q, (snap) => {
        feed.innerHTML = '';
        snap.forEach(docSnap => feed.innerHTML += renderPost(docSnap.id, docSnap.data()));
    });
};

window.changeTab = (t) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('screen-' + t).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('nav-' + t).classList.add('active');
    if(t === 'profile') switchProfileView('my');
};

window.filterByGrade = (g, e) => { currentGrade = g; document.querySelectorAll('.grade-bar .chip').forEach(c => c.classList.remove('active')); e.target.classList.add('active'); applyFilters(); };
window.filterBySubject = (s, e) => { currentSubject = s; document.querySelectorAll('.subject-bar .chip').forEach(c => c.classList.remove('active')); e.target.classList.add('active'); applyFilters(); };
window.openModal = () => document.getElementById('postModal').classList.remove('hidden');
window.closeModal = () => document.getElementById('postModal').classList.add('hidden');
window.openReplyModal = (id) => { activePostId = id; document.getElementById('replyModal').classList.remove('hidden'); };
window.closeReplyModal = () => document.getElementById('replyModal').classList.add('hidden');

document.getElementById('submitReply').onclick = async () => {
    const text = document.getElementById('replyText').value;
    if(!text) return;
    await addDoc(collection(db, "posts", activePostId, "comments"), { text, userName: currentUser.displayName, createdAt: serverTimestamp() });
    closeReplyModal();
    document.getElementById('replyText').value = "";
};

function loadReplies(postId) {
    onSnapshot(query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc")), (snap) => {
        const div = document.getElementById(`replies-${postId}`);
        if(div) {
            div.innerHTML = '';
            snap.forEach(r => div.innerHTML += `<div class="reply-bubble"><b>${r.data().userName}</b> ${r.data().text}</div>`);
        }
    });
}

function initLiveStatus() { document.getElementById('active-count').innerText = Math.floor(Math.random() * 5) + 2; }
document.getElementById('btn-logout').onclick = () => signOut(auth);
document.getElementById('searchInput').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    document.querySelectorAll('.post-card').forEach(card => card.style.display = card.innerText.toLowerCase().includes(val) ? "block" : "none");
});
