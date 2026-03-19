import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAqkLr-uJKIE8uW8zrgqlMpte0KfGPnOBM",
  authDomain: "nasama-hr.firebaseapp.com",
  databaseURL: "https://nasama-hr-default-rtdb.firebaseio.com",
  projectId: "nasama-hr",
  storageBucket: "nasama-hr.firebasestorage.app",
  messagingSenderId: "136664686361",
  appId: "1:136664686361:web:0c5d1fec410f10dfdc6f88",
  measurementId: "G-VH4MMEB0Z0"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
