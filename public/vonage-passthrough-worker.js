self.onrtctransform = (event) => {
  const transformer = event.transformer;
  let frames = 0;
  const stream = new TransformStream({
    transform(frame, controller) {
      frames += 1;
      if (frames === 1 || frames % 30 === 0) {
        self.postMessage({ type: "frame", count: frames });
      }
      controller.enqueue(frame);
    },
  });

  transformer.readable
    .pipeThrough(stream)
    .pipeTo(transformer.writable)
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Encoded transform failed.";
      self.postMessage({ type: "error", message });
    });
};
