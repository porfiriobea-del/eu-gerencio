import {useEmployee} from '../lib/employeeContext';
import type {ReactNode} from 'react';
import {Navigate} from 'react-router-dom';
import {usePermissions} from '../lib/permissionsContext';
import {StaffHome,StaffStock,StaffDebt} from './StaffViews';
export function AccessPage({path,children}:{path:string;children:ReactNode}){
 const access=usePermissions();const {currentEmployee}=useEmployee();
 if(!access.canAccess(path))return <Navigate to="/" replace/>;
 if(access.isEmployee){if(['/caixa','/fiado'].includes(path)&&!currentEmployee?.currentShiftStartedAt)return <StaffHome/>;if(path==='/')return <StaffHome/>;if(path==='/estoque')return <StaffStock/>;if(path==='/fiado')return <StaffDebt/>;}
 return children;
}
