import { describe, expect, it } from "vitest";
import { generationCacheKey } from "./cache-identity";
import type { InterpretRequestBody } from "../interpret-pipeline";

const key = (body: InterpretRequestBody) => generationCacheKey(body, {});
describe("generation cache identity", () => {
  it("ignores credentials, file names and the forced-generation control", () => {
    const a = {transcript:"dinosaur",referenceImage:{base64:"same",mediaType:"image/png",name:"a.png"}};
    const b = {...a,userHfToken:"hf_private",forceGenerate:true,referenceImage:{...a.referenceImage,name:"b.png"}};
    expect(key(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(key(a)).toBe(key(b));
    expect(generationCacheKey(a,{HUGGINGFACE_TOKEN:"hf_server",GEMINI_API_KEY:"secret"})).toBe(key(a));
  });
  it("separates photo-derived rows from plain-text and different photo requests", () => {
    const plain={transcript:"dinosaur"};
    const photo={...plain,referenceImage:{base64:"one",mediaType:"image/png",name:"a"}};
    expect(key(plain)).not.toBe(key(photo));
    expect(key(photo)).not.toBe(key({...photo,referenceImage:{...photo.referenceImage,base64:"two"}}));
    expect(key(photo)).not.toBe(key({...photo,referenceImage:{...photo.referenceImage,additionalViews:[{base64:"back",mediaType:"image/png"}]}}));
  });
  it("separates conversation, existing objects, style and pipeline versions", () => {
    const base={transcript:"make it blue"};
    expect(key(base)).not.toBe(key({...base,history:[{role:"user",content:"the chair"}]}));
    expect(key(base)).not.toBe(key({...base,existingAssets:[{id:"chair",name:"chair"}]}));
    expect(key(base)).not.toBe(key({...base,sessionStyleDNA:{styleLabel:"cartoon"} as InterpretRequestBody["sessionStyleDNA"]}));
    expect(generationCacheKey(base,{},"v1")).not.toBe(generationCacheKey(base,{},"v2"));
    expect(generationCacheKey(base,{YIIYA_PROVIDER_ORDER:"hf-stablefast"})).not.toBe(key(base));
  });
  it("normalizes object-key order without discarding ordered conversation turns", () => {
    const a={transcript:"mug",history:[{role:"user" as const,content:"red"}]};
    expect(key(a)).toBe(key({history:[{content:"red",role:"user"}],transcript:"mug"}));
    expect(key(a)).not.toBe(key({...a,history:[{role:"user",content:"blue"},{role:"user",content:"red"}]}));
  });
  it("separates restyling each source mesh from full generation", () => {
    const prompt = { transcript: "make it walnut" };
    const restyle = { ...prompt, editMode: "restyle" as const, activeAssetGlbUrl: "https://example.hf.space/chair.glb" };
    expect(key(restyle)).not.toBe(key(prompt));
    expect(key(restyle)).not.toBe(key({ ...restyle, activeAssetGlbUrl: "https://example.hf.space/lamp.glb" }));
  });
  it("fails closed on cyclic/unkeyable values", () => {
    const body={transcript:"mug"} as InterpretRequestBody;
    body.sessionStyleDNA=body as unknown as InterpretRequestBody["sessionStyleDNA"];
    expect(key(body)).toBeNull();
  });
});
