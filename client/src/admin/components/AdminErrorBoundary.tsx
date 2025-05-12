import { useNavigate, useRouteError } from "react-router-dom";
import { useEffect } from "react";
import { Logger } from "shared/logger";
import { AxiosError } from "axios";

export const AdminErrorBoundary = () => {
  const navigate = useNavigate();
  const error = useRouteError();

  useEffect(() => {
    // Check if it's an Axios error with 401 or 403 status
    if (
      error instanceof AxiosError &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      Logger.Admin.log(
        `Admin route auth error (${error.response.status}) - redirecting to login`
      );
      navigate("/users/signin?view=login", { replace: true });
    } else {
      // For other errors, just log them
      Logger.Admin.error("Admin route error:", error);
    }
  }, [navigate, error]);

  return null;
};
