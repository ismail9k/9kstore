/** Shown instead of the login form until the Worker has its admin secrets. */
export function NotConfigured() {
  return (
    <p className="py-24 text-center">
      Admin is not set up yet. Set ADMIN_PASSWORD and SESSION_SECRET on this Worker.
    </p>
  );
}
