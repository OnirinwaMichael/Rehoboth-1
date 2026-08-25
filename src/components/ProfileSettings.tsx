import React, { useState } from 'react';
import { supabase, handleSupabaseError } from '../lib/supabase';
import { User } from '../types';
import { toast } from 'sonner';
import { Save, Camera, X, User as UserIcon, Phone, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logAction } from '../lib/audit';
interface Props {
user: User;
onClose: () => void;
}
export const ProfileSettings: React.FC<Props> = ({ user, onClose }) => {
const [name, setName] = useState(user.name);
const [phone, setPhone] = useState(user.phone || '');
const [photoURL, setPhotoURL] = useState(user.photoURL || '');
const [photoFile, setPhotoFile] = useState<File | null>(null);
const [isSaving, setIsSaving] = useState(false);
// Password change states
const [showPasswordChange, setShowPasswordChange] = useState(false);
const [currentPassword, setCurrentPassword] = useState('');
const [newPassword, setNewPassword] = useState('');
const [confirmPassword, setConfirmPassword] = useState('');
const [isChangingPassword, setIsChangingPassword] = useState(false);
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
const file = e.target.files?.[0];
if (file) {
if (file.size > 10 * 1024 * 1024) { // 10MB limit — stored in Supabase Storage, not the database
toast.error('Image is too large. Please select an image under 10MB.');
return;
}
setPhotoFile(file);
setPhotoURL(URL.createObjectURL(file)); // local preview only, not uploaded yet
};
};
const handleSave = async () => {
if (!name.trim()) {
toast.error('Name is required.');
return;
}
setIsSaving(true);
try {
let uploadedPhotoUrl = user.photoURL || null;
if (photoFile) {
const ext = photoFile.name.split('.').pop() || 'jpg';
const path = `${user.uid}/${Date.now()}.${ext}`;
const { error: uploadError } = await supabase.storage
.from('staff-photos')
.upload(path, photoFile, { upsert: true, contentType: photoFile.type });
if (uploadError) throw uploadError;
const { data: publicUrlData } = supabase.storage.from('staff-photos').getPublicUrl(path);
uploadedPhotoUrl = publicUrlData.publicUrl;
}
const { error } = await supabase.from('users').update({
name,
phone,
photo_url: uploadedPhotoUrl,
}).eq('id', user.uid);
if (error) throw error;
await logAction(user.uid, 'UPDATE_PROFILE', `Updated profile information`);
toast.success('Profile updated successfully.');
onClose();
} catch (error) {
handleSupabaseError(error, 'update', 'users');
} finally {
setIsSaving(false);
}
};
const handleChangePassword = async () => {
if (!currentPassword || !newPassword || !confirmPassword) {
toast.error('Please fill in all password fields.');
return;
}
if (newPassword !== confirmPassword) {
toast.error('New passwords do not match.');
return;
}
if (newPassword.length < 8) {
toast.error('New password must be at least 8 characters.');
return;
}
setIsChangingPassword(true);
try {
// Supabase's updateUser doesn't require re-auth the way Firebase
// does, but verifying the current password first preserves the
// same protection (stops a change on an unattended open session
// by someone who doesn't actually know the current password).
const { error: verifyError } = await supabase.auth.signInWithPassword({
email: user.email,
password: currentPassword,
});
if (verifyError) {
toast.error('Current password is incorrect.');
return;
}
const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
if (updateError) throw updateError;
await logAction(user.uid, 'CHANGE_PASSWORD', `Changed account password`);
toast.success('Password changed successfully.');
setShowPasswordChange(false);
setCurrentPassword('');
setNewPassword('');
setConfirmPassword('');
} catch (error: any) {
console.error('Change password error:', error);
toast.error('Failed to change password.');
} finally {
setIsChangingPassword(false);
}
};
return (
<motion.div
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full border border-slate-100 max-h-[90vh] overflow-y-auto"
onClick={(e) => e.stopPropagation()}
>
<div className="flex justify-between items-center mb-6">
<h2 className="text-xl font-bold text-slate-900">Edit Profile</h2>
<button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
<X className="w-5 h-5 text-slate-400" />
</button>
</div>
<div className="space-y-6">
{/* Profile Picture */}
<div className="flex flex-col items-center gap-4">
<div className="relative group">
<div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-md">
{photoURL ? (
<img src={photoURL} alt="Profile" className="w-full h-full object-cover" />
) : (
<div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-600">
<UserIcon className="w-10 h-10" />
</div>
)}
</div>
<label className="absolute bottom-0 right-0 p-2 bg-blue-600 rounded-full text-white cursor-pointer shadow-lg hover:bg-blue-700 transition-colors">
<Camera className="w-4 h-4" />
<input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
</label>
</div>
<p className="text-xs text-slate-400">Max size: 10MB</p>
</div>
{/* Form Fields */}
<div className="space-y-4">
<div className="space-y-1.5">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
<UserIcon className="w-3 h-3" /> Full Name
</label>
<input
type="text"
value={name}
onChange={(e) => setName(e.target.value)}
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
placeholder="Enter your full name"
/>
</div>
<div className="space-y-1.5">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
<Phone className="w-3 h-3" /> Phone Number
</label>
<input
type="tel"
value={phone}
onChange={(e) => setPhone(e.target.value)}
className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
placeholder="Enter your phone number"
/>
</div>
<div className="space-y-1.5">
<label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
Email Address
</label>
<input
type="email"
value={user.email}
disabled
className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed outline-none"
/>
<p className="text-[10px] text-slate-400 italic">Email cannot be changed.</p>
</div>
</div>
{/* Password Change Section */}
<div className="pt-4 border-t border-slate-100">
<button
onClick={() => setShowPasswordChange(!showPasswordChange)}
className="w-full flex items-center justify-between text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors py-2"
>
<span className="flex items-center gap-2">
<Lock className="w-4 h-4" /> Change Password
</span>
{showPasswordChange ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
</button>
<AnimatePresence>
{showPasswordChange && (
<motion.div
initial={{ height: 0, opacity: 0 }}
animate={{ height: 'auto', opacity: 1 }}
exit={{ height: 0, opacity: 0 }}
className="overflow-hidden space-y-4 pt-4"
>
<div className="space-y-1.5">
<label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Password</label>
<input
type="password"
value={currentPassword}
onChange={(e) => setCurrentPassword(e.target.value)}
className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
placeholder="••••••••"
/>
</div>
<div className="space-y-1.5">
<label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Password</label>
<input
type="password"
value={newPassword}
onChange={(e) => setNewPassword(e.target.value)}
className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
placeholder="Min 8 characters"
/>
</div>
<div className="space-y-1.5">
<label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Confirm New Password</label>
<input
type="password"
value={confirmPassword}
onChange={(e) => setConfirmPassword(e.target.value)}
className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
placeholder="••••••••"
/>
</div>
<button
onClick={handleChangePassword}
disabled={isChangingPassword}
className="w-full bg-slate-900 text-white py-2 rounded-lg font-bold text-sm hover:bg-slate-800 transition-all disabled:opacity-50"
>
{isChangingPassword ? 'Updating...' : 'Update Password'}
</button>
</motion.div>
)}
</AnimatePresence>
</div>
<button
onClick={handleSave}
disabled={isSaving}
className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-50"
>
{isSaving ? 'Saving...' : (
<>
<Save className="w-5 h-5" />
Save Changes
</>
)}
</button>
</div>
</motion.div>
);
};
