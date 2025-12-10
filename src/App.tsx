import { useEffect } from "react";
import AuthPanel from "@/components/AuthPanel";
import EventRegisterPanel from "@/components/EventRegisterPanel";
import { useAuthStore } from "@/store/authStore";
import "./App.css";

function App() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const checkSaved = useAuthStore((state) => state.checkSaved);

  useEffect(() => {
    // 保存済みのアクセストークンorリフレッシュトークンがあればsetされる
    checkSaved();
  }, [checkSaved]);

  return (
    <main>
      {!accessToken && <AuthPanel />}
      {accessToken && <EventRegisterPanel />}
    </main>
  );
}

export default App;
