import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { isBlocked } from "@/lib/blocked-users";

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const checkBlockedUser = async (username: string): Promise<boolean> => {
    try {
      // بدون کش، چون ایجنت پشتیبانی این فایل را حین گفت‌وگو روی دیسک عوض
      // می‌کند و مرورگر نباید نسخه‌ی قدیمی را نگه دارد.
      const response = await fetch("/blockusers.txt", { cache: "no-store" });
      return isBlocked(username, await response.text());
    } catch (error) {
      console.error("Error checking blocked users:", error);
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Check if user is blocked
    const isBlocked = await checkBlockedUser(username);
    
    if (isBlocked) {
      setError("حساب کاربری شما مسدود شده است. برای رفع مشکل با پشتیبانی تماس بگیرید.");
      setLoading(false);
      return;
    }

    // اطلاعات ورود عمداً هاردکد شده‌اند: این یک اپ دمو است که فقط نقش
    // «نرم‌افزار سازمانی دارای مشکل» را برای سناریوی پشتیبانی بازی می‌کند.
    // هیچ‌وقت این الگو را در یک سامانه‌ی واقعی استفاده نکنید.
    if (username === "\\vienna\\maxman123" && password === "passw0rd") {
      // Store auth state
      localStorage.setItem("isAuthenticated", "true");
      localStorage.setItem("username", username);
      navigate("/dashboard");
    } else {
      setError("نام کاربری یا رمز عبور نادرست است. دوباره تلاش کنید.");
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-secondary/30 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-2">
            <span className="text-xl font-bold text-primary-foreground">اس</span>
          </div>
          <CardTitle className="text-2xl font-bold">سامانه‌ی داخلی استانداری</CardTitle>
          <CardDescription>به حساب کاربری خود وارد شوید</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">نام کاربری</Label>
              <Input
                id="username"
                type="text"
                dir="ltr"
                placeholder="\domain\username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="text-left transition-all"
              />
              <p className="text-sm text-muted-foreground">
                نام کاربری را دقیقاً به این شکل وارد کنید:{" "}
                <span className="font-mono" dir="ltr">
                  \domain\username
                </span>
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">رمز عبور</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                placeholder="رمز عبور خود را وارد کنید"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="text-left transition-all"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
            >
              {loading ? "در حال ورود…" : "ورود"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
