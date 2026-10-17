import {getAccessState,requireManagement} from './accessControl';
import {shiftAction} from './workforceApi';
import {auth} from './firebase';
import {logout} from './auth';
import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef } from 'react';
import { Employee, Movement } from '../types';
import { 
  subscribeEmployees, 
  addEmployee, 
  updateEmployee, 
  deleteEmployee, 
  recordMovement, 
  getActiveEmployeeStorage, 
  setActiveEmployeeStorage 
} from './api';

export interface EmployeeAnnouncement {
  title: string;
  message: string;
  type: 'entry' | 'exit';
  timestamp: number;
  employeeName: string;
  role?: string;
}

interface EmployeeContextType {
  currentEmployee: Employee | null;
  employees: Employee[];
  isLoadingEmployees: boolean;
  activeShiftDuration: string;
  activeAnnouncement: EmployeeAnnouncement | null;
  clearAnnouncement: () => void;
  loginEmployee: (employee: Employee) => Promise<void>;
  logoutEmployee: () => Promise<void>;
  createEmployee: (data: Omit<Employee, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  editEmployee: (id: string, data: Partial<Employee>) => Promise<void>;
  removeEmployee: (id: string) => Promise<void>;
  isSwitchModalOpen: boolean;
  openSwitchModal: () => void;
  closeSwitchModal: () => void;
}

const EmployeeContext = createContext<EmployeeContextType | undefined>(undefined);

export const EmployeeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [activeAnnouncement, setActiveAnnouncement] = useState<EmployeeAnnouncement | null>(null);
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(() => {
    try {
      const stored = getActiveEmployeeStorage();
      if (stored && stored.id && stored.id !== 'owner') {
        return {
          id: stored.id,
          name: stored.name,
          role: stored.role || 'Operador',
          isActive: true,
          ownerId: '',
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
    } catch {}
    return null;
  });

  // Calculate real-time shift duration
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTs(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  const activeShiftDuration = useMemo(() => {
    if (!currentEmployee || !currentEmployee.currentShiftStartedAt) return '';
    const diffMs = Math.max(0, nowTs - currentEmployee.currentShiftStartedAt);
    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
      return `${minutes} min`;
    }
    return `${hours}h ${minutes}m`;
  }, [currentEmployee, nowTs]);

  // Subscribe to real-time employees from Supabase
  useEffect(() => {
    const unsub = subscribeEmployees((list) => {
      setEmployees(list);
      setIsLoadingEmployees(false);

      // Keep current employee in sync if their record updated in database
      if (currentEmployee?.id) {
        const found = list.find(e => e.id === currentEmployee.id);
        if (found) {
          setCurrentEmployee(found);
          setActiveEmployeeStorage({ id: found.id!, name: found.name, role: found.role });
        }
      }
    });

    return () => unsub();
  }, [currentEmployee?.id]);

  // Auto-dismiss announcements after 8 seconds
  useEffect(() => {
    if (!activeAnnouncement) return;
    const timer = setTimeout(() => {
      setActiveAnnouncement(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [activeAnnouncement]);

  const clearAnnouncement = () => setActiveAnnouncement(null);
  const openSwitchModal = () => setIsSwitchModalOpen(true);
  const closeSwitchModal = () => setIsSwitchModalOpen(false);

  // Starts/ends are authoritative, idempotent operations; never fire-and-forget.
  const loginEmployee = async (employee:Employee) => {
    const state=getAccessState();
    if(!state.scoped && state.role==='employee' && currentEmployee?.id!==employee.id)throw new Error('Entre apenas no seu próprio turno.');
    if(state.scoped && employee.email?.trim().toLowerCase()!==auth.currentUser?.email?.trim().toLowerCase())throw new Error('Entre apenas no seu próprio turno.');
    const shift=await shiftAction('start',employee.id);
    const updated={...employee,currentShiftStartedAt:shift?.started_at};
    setCurrentEmployee(updated);
    setActiveEmployeeStorage({id:employee.id!,name:employee.name,role:employee.role});
    setIsSwitchModalOpen(false);
  };
  const logoutEmployee = async () => {
    if(!currentEmployee)return;
    await shiftAction('end',currentEmployee.id);
    // A shared owner login must never become an owner session just by ending a staff shift.
    if(!getAccessState().scoped){await logout();return;}
    setCurrentEmployee(null);setActiveEmployeeStorage(null);setIsSwitchModalOpen(false);
  };
  const automaticLogin=useRef('');
  useEffect(()=>{
    if(!getAccessState().scoped || isLoadingEmployees)return;
    const employee=[...employees].sort((a,b)=>(b.updatedAt || 0)-(a.updatedAt || 0)||String(a.id).localeCompare(String(b.id))).find(e=>e.isActive && e.email?.trim().toLowerCase()===auth.currentUser?.email?.trim().toLowerCase());
    const key=getAccessState().storeId+':'+(auth.currentUser?.uid || '');
    if(!employee || automaticLogin.current===key)return;
    automaticLogin.current=key;
    void loginEmployee(employee).catch(()=>{automaticLogin.current='';});
  },[isLoadingEmployees,employees]);

  const createEmployee = async (data: Omit<Employee, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>) => {
    requireManagement();
    const id = await addEmployee(data);
    return id;
  };

  const editEmployee = async (id: string, data: Partial<Employee>) => {
    requireManagement();
    await updateEmployee(id, data);
  };

  const removeEmployee = async (id: string) => {
    requireManagement();
    const emp = employees.find(e => e.id === id);
    if (currentEmployee?.id === id) {
      await logoutEmployee();
    }
    await deleteEmployee(id, emp?.name);
  };

  return (
    <EmployeeContext.Provider
      value={{
        currentEmployee,
        employees,
        isLoadingEmployees,
        activeShiftDuration,
        activeAnnouncement,
        clearAnnouncement,
        loginEmployee,
        logoutEmployee,
        createEmployee,
        editEmployee,
        removeEmployee,
        isSwitchModalOpen,
        openSwitchModal,
        closeSwitchModal
      }}
    >
      {children}
    </EmployeeContext.Provider>
  );
};

export const useEmployee = (): EmployeeContextType => {
  const context = useContext(EmployeeContext);
  if (!context) {
    throw new Error('useEmployee must be used within an EmployeeProvider');
  }
  return context;
};
