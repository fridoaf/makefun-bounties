import{readdirSync as R,readFileSync as F,mkdirSync as K,writeFileSync as W}from"node:fs";
import{join as J}from"node:path";
function V(p:Uint8Array,q:Uint8Array){
 const D=new Int32Array(256),C=new Int32Array(64),M=new Int32Array(256),O=new Uint8Array(65536);
 let s=0,c=0,o=0,i=0,x=0,t=0,n=p.length;
 const T=(e:number)=>({o:O.slice(0,o),e});
 for(;;){
  if(t===1e6)return T(10);
  if(x<0||x>=n)return T(9);
  const a=p[x];let g=0,y=0,z=0;
  if(a<8){g=a==1?1:a==2?4:0;y=[0,0,0,1,1,2,2,3][a];z=[0,1,1,0,2,2,3,3][a]}
  else if(a<0x10)return T(5);
  else if(a<0x23){y=2;z=1;if(a==0x17||a==0x1b)y=1}
  else if(a<0x30)return T(5);
  else if(a<0x33){g=2;y=a==0x30?0:1}
  else if(a==0x33)g=2;
  else if(a==0x34);
  else if(a<0x40)return T(5);
  else if(a==0x40){y=1;z=1}
  else if(a==0x41)y=2;
  else if(a<0x50)return T(5);
  else if(a<0x54){if(a==0x52)z=1;else y=1}
  else return T(5);
  if(x+g>=n)return T(9);
  t++;const N=x+1+g;
  if(s<y)return T(2);
  if(s-y+z>256)return T(3);
  x=N;
  if(a==0)return T(0);
  if(a==1){D[s++]=(p[N-1]<<24)>>24;continue}
  if(a==2){D[s++]=p[N-4]|p[N-3]<<8|p[N-2]<<16|p[N-1]<<24;continue}
  if(a==3){s--;continue}
  if(a==4){D[s]=D[s-1];s++;continue}
  if(a==5){const v=D[s-1];D[s-1]=D[s-2];D[s-2]=v;continue}
  if(a==6){D[s]=D[s-2];s++;continue}
  if(a==7){const v=D[s-3];D[s-3]=D[s-2];D[s-2]=D[s-1];D[s-1]=v;continue}
  if(a==0x17){D[s-1]=-D[s-1]|0;continue}
  if(a==0x1b){D[s-1]=~D[s-1];continue}
  if(a>=0x10&&a<=0x22){
   const b=D[s-1],A=D[s-2];let v=0;
   if(a<0x17){
    if(a==0x10)v=A+b|0;
    else if(a==0x11)v=A-b|0;
    else if(a==0x12)v=Math.imul(A,b);
    else if(a==0x13){if(!b)return T(4);v=A==-2147483648&&b==-1?A:A/b|0}
    else if(a==0x14){if(!b)return T(4);v=b==-1?0:A%b|0}
    else if(a==0x15){if(!b)return T(4);v=(A>>>0)/(b>>>0)|0}
    else{if(!b)return T(4);v=(A>>>0)%(b>>>0)|0}
   }else if(a<0x1c)v=a==0x18?A&b:a==0x19?A|b:A^b;
   else if(a<0x20)v=a==0x1c?A<<(b&31):a==0x1d?A>>(b&31):(A>>>(b&31))|0;
   else v=a==0x20?A==b?1:0:a==0x21?A<b?1:0:(A>>>0)<(b>>>0)?1:0;
   s-=2;D[s++]=v;continue;
  }
  if(a>=0x30&&a<=0x32){
   const r=((p[N-2]|p[N-1]<<8)<<16)>>16;let k=1;
   if(a!=0x30){const v=D[--s];k=a==0x31?v==0:v!=0}
   if(k)x=N+r;
   continue;
  }
  if(a==0x33){if(c==64)return T(7);C[c++]=N;x=p[N-2]|p[N-1]<<8;continue}
  if(a==0x34){if(!c)return T(8);x=C[--c];continue}
  if(a==0x40){const d=D[s-1];if(d<0||d>255)return T(6);D[s-1]=M[d];continue}
  if(a==0x41){const d=D[s-1],v=D[s-2];if(d<0||d>255)return T(6);s-=2;M[d]=v;continue}
  if(a==0x50){const y=String(D[s-1]);if(o+y.length>65536)return T(11);s--;for(let k=0;k<y.length;k++)O[o++]=y.charCodeAt(k);continue}
  if(a==0x51){if(o+1>65536)return T(11);O[o++]=D[--s]&255;continue}
  if(a==0x52){D[s++]=i<q.length?q[i++]:-1;continue}
  if(a==0x53)return T(D[--s]&255);
 }
}
const I=process.env.MAKEFUN_INPUT_DIR??"/input",P=process.env.MAKEFUN_OUTPUT_DIR??"/output";
for(const d of R(I).sort()){
 const r=V(new Uint8Array(F(J(I,d,"program.bin"))),new Uint8Array(F(J(I,d,"input.bin"))));
 K(J(P,d),{recursive:true});
 W(J(P,d,"stdout.bin"),r.o);
 W(J(P,d,"exit.txt"),r.e+"\n");
}
