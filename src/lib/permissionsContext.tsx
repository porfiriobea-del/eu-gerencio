import {createContext,useContext} from 'react';
import type {AccessRole} from './accessControl';
interface Permissions {role:AccessRole;isEmployee:boolean;isOwner:boolean;employeeId?:string;ready:boolean;canAccess:(path:string)=>boolean;}
const fallback:Permissions={role:'owner',isEmployee:false,isOwner:true,ready:true,canAccess:()=>true};
export const PermissionsContext=createContext<Permissions>(fallback);
export const usePermissions=()=>useContext(PermissionsContext);
