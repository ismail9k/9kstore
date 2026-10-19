import { getSecrets } from "@/lib/auth/secrets";

import { NotConfigured } from "../not-configured";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (!(await getSecrets())) return <NotConfigured />;

  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <LoginForm />
    </div>
  );
}
