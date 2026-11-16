import { ChapterHeader, SiteShell } from "@/components/site/site-shell";
import { Work } from "@/components/work/work";
import { Platform } from "@/components/platform/platform";
import { products } from "@/content/products";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "The building IoT platform",
  description:
    "The building IoT platform I run on GKE: six case studies as working models, then its traffic, its SLOs and alerts, and where the money went.",
  path: "/iot",
});

export default function IotPage() {
  return (
    <SiteShell path="/iot">
      <ChapterHeader
        product="iot"
        title="The building IoT platform"
        lead={`${products.iot.what} I run it on GKE at Primustech. Below are six changes I shipped on it, each as a model you can run, and after them the platform seen from the inside.`}
      />
      <Work chapter="iot" />
      <Platform />
    </SiteShell>
  );
}
