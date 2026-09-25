import { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { ResponseStatus } from "core/types/api";
import { apiClient } from "../../../src/shared/apiClient";
import { ContentModerationNotification } from "../../../src/shared/notifications/ContentModerationNotification";
import { NotificationContext } from "../../../src/shared/notifications/NotificationContext";
import { NotificationDisplay } from "../../../src/shared/notifications/NotificationDisplay";
import type { Notification } from "../../../src/shared/notifications/notifications";
import { notificationService } from "../../../src/shared/notifications/notificationService";
import { accessibleText, renderMarkup } from "../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);

const MODERATION =
  "Our automated moderation, which uses AI, flagged your content, so we couldn't process it.";

describe("ContentModerationNotification", () => {
  it("says the moderation that flagged the content is automated and uses AI", () => {
    const html = renderMarkup(
      <ContentModerationNotification
        contentModeration={{
          reason: "Sexual content involving minors",
          prompt: "a story premise",
        }}
      />
    );

    expect(accessibleText(html)).toContain(
      `${MODERATION} Reason: Sexual content involving minors`
    );
  });
});

describe("moderation notification people see", () => {
  // The API client reads the CSRF cookie before each request; Jest has no DOM
  beforeAll(() => {
    (globalThis as { document?: unknown }).document = { cookie: "" };
  });
  afterAll(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("shows the approved moderation copy, then the reason, when the server blocks a request", async () => {
    const shown: Omit<Notification, "id">[] = [];
    notificationService.setCallback((notification) => shown.push(notification));

    // The server's answer to a blocked story premise (sendModerationBlocked)
    const blocked = (config: InternalAxiosRequestConfig) =>
      Promise.reject(
        new AxiosError("Bad Request", "ERR_BAD_REQUEST", config, null, {
          status: 400,
          statusText: "Bad Request",
          headers: {},
          config,
          data: {
            status: ResponseStatus.MODERATION_BLOCKED,
            requestId: "r1",
            timestamp: 0,
            moderation: { reason: "Graphic violence", prompt: "a premise" },
          },
        })
      );
    await expect(
      apiClient.post("/stories", { prompt: "a premise" }, { adapter: blocked })
    ).rejects.toBeDefined();

    expect(shown).toHaveLength(1);
    const html = renderMarkup(
      <NotificationContext.Provider
        value={{
          notifications: [{ ...shown[0], id: "n1" } as Notification],
          addNotification: jest.fn(),
          removeNotification: jest.fn(),
          clearNotifications: jest.fn(),
        }}
      >
        <NotificationDisplay />
      </NotificationContext.Provider>
    );

    expect(accessibleText(html)).toBe(
      `Content Moderation ${MODERATION} Graphic violence`
    );
  });
});
