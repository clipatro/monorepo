import { Composition } from "remotion";
import { EconomyDocumentary } from "./compositions/EconomyDocumentary";
import config from "./composition-config.json";

export const Root = () => {
  return (
    <>
      <Composition
        id="EconomyDocumentary"
        component={EconomyDocumentary}
        durationInFrames={config.totalFrames}
        fps={config.fps}
        width={config.width}
        height={config.height}
      />
    </>
  );
};
