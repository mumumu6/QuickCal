import ReactDOM from "react-dom/client";
import App from "./App";
import { useAuthStore } from "@/store/authStore";

// 保存済みのアクセストークンorリフレッシュトークンがあればsetされる
useAuthStore.getState().checkSaved();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
