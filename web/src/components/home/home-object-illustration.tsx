export type HomeObjectKind = "backpack" | "keys" | "bottle" | "headphones";

export function HomeObjectIllustration({
  kind,
  className,
}: {
  kind: HomeObjectKind;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      fill="none"
      height="160"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="5"
      viewBox="0 0 160 160"
      width="160"
    >
      {kind === "backpack" ? (
        <>
          <path d="M55 47V33a25 25 0 0 1 50 0v14" />
          <path d="M41 47h78c7 0 12 5 13 12l8 83c1 7-4 12-11 12H31c-7 0-12-5-11-12l8-83c1-7 6-12 13-12Z" />
          <path d="M43 47v31m74-31v31M30 61c-14 7-17 21-17 43m117-43c14 7 17 21 17 43" />
          <path d="M47 91h66v51H47zM61 91V78h38v13" />
          <path d="M59 108h42c6 0 10 4 10 10v13H49v-13c0-6 4-10 10-10Z" />
          <path d="M72 120h16" />
        </>
      ) : null}
      {kind === "keys" ? (
        <>
          <circle cx="52" cy="54" r="27" />
          <circle cx="52" cy="54" r="8" />
          <path d="m71 74 56 56 13-13-16-16 8-8-12-12-8 8-20-20" />
          <path d="M38 80 34 126h16l3-13h15" />
        </>
      ) : null}
      {kind === "bottle" ? (
        <>
          <path d="M59 12h42v23H59zM53 35h54v16l-8 15v75c0 5-4 9-9 9H70c-5 0-9-4-9-9V66l-8-15z" />
          <path d="M62 84h36v36H62zM70 101h20" />
        </>
      ) : null}
      {kind === "headphones" ? (
        <>
          <path d="M28 91V76a52 52 0 0 1 104 0v15" />
          <path d="M22 88h15c7 0 12 5 12 12v36c0 7-5 12-12 12H22c-7 0-12-5-12-12v-36c0-7 5-12 12-12Zm101 0h15c7 0 12 5 12 12v36c0 7-5 12-12 12h-15c-7 0-12-5-12-12v-36c0-7 5-12 12-12Z" />
          <path d="M49 136c9 8 20 12 31 12s22-4 31-12" />
        </>
      ) : null}
    </svg>
  );
}
