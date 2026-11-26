const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GoogleSheetService,
  normalizeAppsScriptWebAppUrl,
} = require("../src/main/googleSheetService");

test("removes a Google multi-account segment from an Apps Script web app URL", () => {
  const input =
    "https://script.google.com/macros/u/2/s/AKfyExample/exec?department=Cong%20an#summary";

  assert.equal(
    normalizeAppsScriptWebAppUrl(input),
    "https://script.google.com/macros/s/AKfyExample/exec?department=Cong%20an#summary"
  );
});

test("leaves an already canonical Apps Script web app URL unchanged", () => {
  const input = "https://script.google.com/macros/s/AKfyExample/exec";

  assert.equal(normalizeAppsScriptWebAppUrl(input), input);
});

test("does not rewrite unrelated URLs or Apps Script editor paths", () => {
  assert.equal(
    normalizeAppsScriptWebAppUrl("https://example.com/macros/u/2/s/id/exec"),
    "https://example.com/macros/u/2/s/id/exec"
  );
  assert.equal(
    normalizeAppsScriptWebAppUrl("https://script.google.com/u/2/home/projects/id/edit"),
    "https://script.google.com/u/2/home/projects/id/edit"
  );
});

test("normalizes the persisted webhook URL before the service uses it", () => {
  const service = new GoogleSheetService(
    {
      getPublicSettings() {
        return {
          googleSheetWebhookUrl:
            "https://script.google.com/macros/u/12/s/AKfyExample/exec",
        };
      },
    },
    process.cwd()
  );

  assert.equal(
    service.getConfig().webhookUrl,
    "https://script.google.com/macros/s/AKfyExample/exec"
  );
});
