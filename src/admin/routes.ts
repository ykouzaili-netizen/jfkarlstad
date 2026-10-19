import type { Router } from "../router.js";
import { redirect } from "../lib/http.js";
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
import { jobStatsCsv, jobStatsPage } from "./job-stats.js";
import { RESOURCES, instagramSyncSubmit, deleteHandler, duplicateHandler, editHandler, listHandler, moveHandler, newHandler, orderHandler, saveHandler, toggleHandler } from "./resources.js";
import { historyPage, historyRestore, menuSubmit, textsPage, textsSubmit, undoSubmit, resetLayoutSubmit } from "./texts.js";
import { mediaAdjustPage, mediaAdjustSubmit, mediaDeleteSubmit, mediaOptimizeSubmit, mediaLibraryPage, mediaPickerFragment, mediaUploadSubmit } from "./media-pages.js";
import { partnerStatsCsv, partnerStatsPage } from "./stats-pages.js";
import { adminSearchPage } from "./search.js";
import { handoverPage, handoverSubmit } from "./handover.js";
import { mailPage, mailRecipientsSubmit, mailTestSubmit } from "./mail-page.js";
import { linkCheckBatch, linkCheckPage, linkCheckSubmit } from "./link-check.js";
import { galleryBulkSubmit, galleryCoverPage, galleryDuplicates, galleryCoverSubmit, galleryExifSubmit, galleryListPage, galleryResetSubmit, galleryZipList } from "./gallery-list.js";

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
    .post("/admin/texter/aterstall-uppbyggnad", requireUser(resetLayoutSubmit))
    .get("/admin/texter/historik", requireUser(historyPage))
    .post("/admin/texter/historik", requireUser(historyRestore))
    .post("/admin/texter/meny", requireUser(menuSubmit))
    .get("/admin/sok", requireUser(adminSearchPage))
    .get("/admin/webbplatsen", requireUser(siteMapHandler))
    .get("/admin/bildbank", requireUser((c, s) => mediaLibraryPage(c, s)))
    .post("/admin/bildbank", requireUser(mediaUploadSubmit))
    .post("/admin/bildbank/radera", requireUser(mediaDeleteSubmit))
    .post("/admin/bildbank/optimera", requireUser(mediaOptimizeSubmit))
    .get("/admin/bildbank/valj", requireUser(mediaPickerFragment))
    .get("/admin/bildbank/justera", requireUser(mediaAdjustPage))
    .post("/admin/bildbank/justera", requireUser(mediaAdjustSubmit))
    // Före /admin/partners/:id och /admin/jobb/:id nedan
    .get("/admin/jobb/statistik", requireUser(jobStatsPage))
    .get("/admin/jobb/statistik.csv", requireUser(jobStatsCsv))
    .get("/admin/lankar", requireUser(linkCheckPage))
    .post("/admin/lankar", requireUser(linkCheckSubmit))
    .post("/admin/lankar/kontroll", requireUser(linkCheckBatch))
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

  // Före de generiska adresserna, annars tolkas "hamta" som ett id
  router.post("/admin/instagram/hamta", requireUser(instagramSyncSubmit));
  // "Sätt år på flera bilder" är ersatt av Ändra flera i listan
  router.get("/admin/galleri/ar", requireUser(async () => redirect("/admin/galleri", 301)));
  // Bildgalleriets egen lista (kategorier, sortering, dra och släpp, återställ) i stället för den generiska
  router
    .get("/admin/galleri", requireUser(galleryListPage))
    .post("/admin/galleri/aterstall", requireUser(galleryResetSubmit))
    .post("/admin/galleri/fotodatum", requireUser(galleryExifSubmit))
    .post("/admin/galleri/flera", requireUser(galleryBulkSubmit))
    .post("/admin/galleri/dubbletter", requireUser(galleryDuplicates))
    .get("/admin/galleri/zip", requireUser(galleryZipList))
    .get("/admin/galleri-kategorier/:id/omslag", requireUser(galleryCoverPage))
    .post("/admin/galleri-kategorier/:id/omslag", requireUser(galleryCoverSubmit));
  for (const r of RESOURCES) {
    // Före /:id, annars tolkas "ordning" som ett id
    if (r.movable) router.post(`/admin/${r.path}/ordning`, requireUser(orderHandler(r)));
    router
      .get(`/admin/${r.path}`, requireUser(listHandler(r)))
      .get(`/admin/${r.path}/ny`, requireUser(newHandler(r)))
      .post(`/admin/${r.path}/ny`, requireUser(saveHandler(r)))
      .get(`/admin/${r.path}/:id`, requireUser(editHandler(r)))
      .post(`/admin/${r.path}/:id`, requireUser(saveHandler(r)))
      .post(`/admin/${r.path}/:id/radera`, requireUser(deleteHandler(r)));
    if (r.publishable) router.post(`/admin/${r.path}/:id/publicera`, requireUser(toggleHandler(r)));
    if (r.duplicable) router.post(`/admin/${r.path}/:id/kopiera`, requireUser(duplicateHandler(r)));
    if (r.movable) router.post(`/admin/${r.path}/:id/flytta`, requireUser(moveHandler(r)));
  }

  // Endast administratörer
  router
    .get("/admin/utseende", requireUser((c, s) => appearancePage(c, s), "admin"))
    .post("/admin/utseende", requireUser(appearanceSubmit, "admin"))
    .get("/admin/e-post", requireUser(mailPage, "admin"))
    .post("/admin/e-post/test", requireUser(mailTestSubmit, "admin"))
    .post("/admin/e-post/mottagare", requireUser(mailRecipientsSubmit, "admin"))
    .get("/admin/anvandare", requireUser((c, s) => usersPage(c, s), "admin"))
    .post("/admin/anvandare", requireUser(userCreate, "admin"))
    .post("/admin/anvandare/:id/lank", requireUser(userLink, "admin"))
    .post("/admin/anvandare/:id/roll", requireUser(userRole, "admin"))
    .post("/admin/anvandare/:id/ta-bort", requireUser(userRemove, "admin"))
    .get("/admin/logg", requireUser(logPage, "admin"))
    .get("/admin/styrelseskifte", requireUser(handoverPage, "admin"))
    .post("/admin/styrelseskifte", requireUser(handoverSubmit, "admin"));
}
