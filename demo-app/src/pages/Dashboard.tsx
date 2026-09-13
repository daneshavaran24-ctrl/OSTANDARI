import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, Users, BarChart3, Settings, FileText } from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const username = localStorage.getItem("username");
  const displayName = username?.split("\\").pop() || "User";

  useEffect(() => {
    const isAuth = localStorage.getItem("isAuthenticated");
    if (!isAuth) {
      navigate("/");
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("username");
    navigate("/");
  };

  const statsCards = [
    { title: "کل کاربران", value: (2543).toLocaleString("fa-IR"), icon: Users, change: "+۱۲٪" },
    { title: "نشست‌های فعال", value: (847).toLocaleString("fa-IR"), icon: BarChart3, change: "+۵٪" },
    { title: "گزارش‌ها", value: (124).toLocaleString("fa-IR"), icon: FileText, change: "+۲۳٪" },
    { title: "وضعیت سامانه", value: "سالم", icon: Settings, change: "۱۰۰٪" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">اس</span>
            </div>
            <h1 className="text-2xl font-bold">سامانه‌ی داخلی استانداری</h1>
          </div>
          <Button 
            variant="outline" 
            onClick={handleLogout}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            خروج
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">
            {displayName} عزیز، خوش آمدید!
          </h2>
          <p className="text-muted-foreground">
            وضعیت امروز حساب کاربری شما به این شکل است.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          {statsCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-primary">{stat.change}</span> نسبت به ماه گذشته
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>فعالیت‌های اخیر</CardTitle>
            <CardDescription>آخرین تعامل‌های شما با سامانه</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { action: "ورود به سامانه", time: "۲ دقیقه پیش", status: "success" },
                { action: "به‌روزرسانی تنظیمات نمایه", time: "۱ ساعت پیش", status: "info" },
                { action: "تولید گزارش", time: "۳ ساعت پیش", status: "success" },
                { action: "پشتیبان‌گیری سامانه", time: "۵ ساعت پیش", status: "success" },
              ].map((activity, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 transition-colors hover:bg-muted"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      activity.status === "success" ? "bg-primary" : "bg-accent"
                    }`} />
                    <div>
                      <p className="text-sm font-medium">{activity.action}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;
