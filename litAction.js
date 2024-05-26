export const litActionSign = `
(async () => {
  const sigShare = await LitActions.signEcdsa({
    toSign: dataToSign,
    publicKey,
    sigName,
  });
})();
`;
