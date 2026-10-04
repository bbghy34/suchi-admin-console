import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import babel from 'next/dist/compiled/babel/core.js';
const require=createRequire(import.meta.url);
const {code}=babel.transformSync(readFileSync(new URL('../components/desk/DeskNav.jsx',import.meta.url),'utf8'),{filename:'DeskNav.jsx',presets:[['next/babel',{'preset-env':{modules:'commonjs'}}]]});
function render(person,open=false){let index=0;const dependencies={react:{...React,useState:value=>[index++===2?open:value,()=>{}],useEffect(){},useRef:()=>({current:null})},'next/link':({children,...props})=>React.createElement('a',props,children),'next/navigation':{usePathname:()=>'/tenders/desk'},'@/lib/desk/desk-theme':{DESK_THEMES:[],deskTheme:()=> 'dark'},'./CommandPalette':{openCommandPalette(){}}};const module={exports:{}};Function('require','module','exports',code)(name=>dependencies[name]??require(name),module,module.exports);return renderToStaticMarkup(React.createElement(module.exports.DeskNav,{person,unread:2}));}
test('compact navigation shows three main destinations with unread More control',()=>{const html=render({isAdmin:true});for(const label of ['Dashboard','My tenders','Money','More'])assert.match(html,new RegExp(label));assert.doesNotMatch(html,/href="\/tenders\/desk\/(jobs|fetch|inbox|people)"/);assert.match(html,/aria-expanded="false"/);});
test('More exposes activity and management destinations',()=>{const html=render({isAdmin:true},true);for(const path of ['jobs','fetch','inbox','people'])assert.match(html,new RegExp(`href="/tenders/desk/${path}"`));assert.match(html,/aria-expanded="true"/);});
test('More retains role visibility',()=>{const html=render({isAdmin:false,isExecutive:false,isAccounts:false},true);assert.match(html,/Notifications/);assert.doesNotMatch(html,/Portal review|People/);});
