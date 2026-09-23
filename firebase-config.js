// Firebase設定ファイル
// Firebase Console (https://console.firebase.google.com/) でプロジェクトを作成し、
// プロジェクトの「ウェブアプリ」の設定値（firebaseConfig）をここに貼り付けてください。

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// あなた（管理者）のGoogleメールアドレス
// このアドレスでログインしたユーザーは自動的に「管理者権限」を持ち、他のユーザーの承認・管理ができます。
const ADMIN_EMAIL = "kikumarubeam219@gmail.com"; // ※ご自身のメールアドレスに変更してください
