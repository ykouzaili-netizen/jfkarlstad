import type { Router } from "../router.js";
import { requireUser } from "./auth.js";
import { forgotPage, forgotSubmit, loginPage, loginSubmit, logoutSubmit, resetPage, resetSubmit, setupPage, setupSubmit } from "./auth-pages.js";
import {
  accountPage,
  accountSubmit,
  appearancePage,
  appearanceSubmit,
  dashboard,
  logPage,
  messageDelete,
  messageDetail,
  messageStatus,
  messagesCsv,
  messagesPage,
  userCreate,
  userLink,
  userRemove,
  userRole,
  usersPage,
} from "./pages.js";
import { previewHandler, siteMapHandler } from "./preview.js";
import { RESOURCES, deleteHandler, duplicateHandler, editHandler, listHandler, newHandler, saveHandler, toggleHandler } from "./resources.js";
import { historyPage, historyRestore, menuSubmit, textsPage, textsSubmit, undoSubmit } from "./texts.js";
import { mediaDeleteSubmit, mediaLibraryPage, mediaPickerFragment, mediaUploadSubmit } from "./media-pages.js";
import { partnerStatsCsv, partnerStatsPage } from "./stats-pages.js";
import { adminSearchPage } from "./search.js";
import { handoverPage, handoverSubmit } from "./handover.js";

export function registerAdminRoutes(router: Router): void {
  // Utan inloggning
  router
    .get("/admin/logga-in", (c) => loginPage(c))
    .post("/admin/logga-in", loginSubmit)
    .post("/admin/logga-ut", logoutSubmit)
    .get("/admin/glomt-losenord", (c) => forgotPage(c))
    .post("/admin/glomt-losenord", forgotSubmit)
    .get("/admin/losenord/:token", (c) => resetPage(c))
    .post("/admin/losenord/:token", resetSubmit)
    .get("/admin/setup", (c) => setupPage(c))
    .post("/admin/setup", setupSubmit);

  // Inloggad (alla roller)
  router
    .get("/admin", requireUser(dashboard))
    .get("/admin/texter", requireUser((c, s) => textsPage(c, s)))
    .post("/admin/texter", requireUser(textsSubmit))
    .post("/admin/texter/angra", requireUser(undoSubmit))
    .get("/admin/texter/historik", requireUser(historyPage))
    .post("/admin/texter/historik", requireUser(historyRestore))
    .post("/admin/texter/meny", requireUser(menuSubmit))
    .get("/admin/sok", requireUser(adminSearchPage))
    .get("/admin/webbplatsen", requireUser(siteMapHandler))
    .get("/admin/bildbank", requireUser((c, s) => mediaLibraryPage(c, s)))
    .post("/admin/bildbank", requireUser(mediaUploadSubmit))
    .post("/admin/bildbank/radera", requireUser(mediaDeleteSubmit))
    .get("/admin/bildbank/valj", requireUser(mediaPickerFragment))
    // Före /admin/partners/:id nedan
    .get("/admin/partners/statistik", requireUser(partnerStatsPage))
    .get("/admin/partners/statistik.csv", requireUser(partnerStatsCsv))
    .get("/admin/meddelanden", requireUser(messagesPage))
    .get("/admin/meddelanden.csv", requireUser(messagesCsv))
    .get("/admin/meddelanden/:id", requireUser(messageDetail))
    .post("/admin/meddelanden/:id/status", requireUser(messageStatus))
    .post("/admin/meddelanden/:id/radera", requireUser(messageDelete))
    .post("/admin/forhandsvisning", requireUser(previewHandler))
    .get("/admin/konto", requireUser((c, s) => accountPage(c, s)))
    .post("/admin/konto", requireUser(accountSubmit));

  for (const r of RESOURCES) {
    router
      .get(`/admin/${r.path}`, requireUser(listHandler(r)))
      .get(`/admin/${r.path}/ny`, requireUser(newHandler(r)))
      .post(`/admin/${r.path}/ny`, requireUser(saveHandler(r)))
      .get(`/admin/${r.path}/:id`, requireUser(editHandler(r)))
      .post(`/admin/${r.path}/:id`, requireUser(saveHandler(r)))
      .post(`/admin/${r.path}/:id/radera`, requireUser(deleteHandler(r)));
    if (r.publishable) router.post(`/admin/${r.path}/:id/publicera`, requireUser(toggleHandler(r)));
    if (r.duplicable) router.post(`/admin/${r.path}/:id/kopiera`, requireUser(duplicateHandler(r)));
  }

  // Endast administratörer
  router
    .get("/admin/utseende", requireUser((c, s) => appearancePage(c, s), "admin"))
    .post("/admin/utseende", requireUser(appearanceSubmit, "admin"))
    .get("/admin/anvandare", requireUser((c, s) => usersPage(c, s), "admin"))
    .post("/admin/anvandare", requireUser(userCreate, "admin"))
    .post("/admin/anvandare/:id/lank", requireUser(userLink, "admin"))
    .post("/admin/anvandare/:id/roll", requireUser(userRole, "admin"))
    .post("/admin/anvandare/:id/ta-bort", requireUser(userRemove, "admin"))
    .get("/admin/logg", requireUser(logPage, "admin"))
    .get("/admin/styrelseskifte", requireUser(handoverPage, "admin"))
    .post("/admin/styrelseskifte", requireUser(handoverSubmit, "admin"));
}
